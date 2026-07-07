# 公司数据服务器搭建说明（Linux + ZFS 镜像）

> 面向 HMAS 液压监测系统的**公司长期数据服务器**。
> 目标：每晚从阿里云拉取 ~30 台设备的数据，用 PostgreSQL/TimescaleDB 长期保存，
> ZFS 双盘镜像保证坏一块盘不丢数据。
> 操作视角：服务器装 **Linux（Ubuntu Server 24.04 LTS）**，你用 **MacBook（macOS）** 远程登录维护。

---

## 0. 先读这一段

- **分工**：服务器 7×24 无人值守跑数据库；MacBook 只当管理终端，macOS 自带完整的 `ssh` / `scp` / `rsync` 工具链，打开「终端」就能管，不用装任何额外软件（做启动盘时装一个 balenaEtcher 即可）。
- **本说明假设**：服务器是一台单独的机器（新买或旧机改造），2 块数据盘做 ZFS 镜像，1~2 块小 SSD/NVMe 装系统。
- **⚠️ 动手前先处理的安全问题**（仓库里已泄漏，本方案会用到 SSH 连阿里云）：
  1. `check-aliyun-status.sh` 里注释含阿里云 **root SSH 明文密码** → 立刻登录阿里云改密码，并改成**仅密钥登录**。
  2. `README.md` / `cloud-server/README.md` 里的 **ADMIN_TOKEN** 和设备默认 **secret** → 在服务器上轮换，文档改占位符。
  下面的"阶段 D"用 SSH **密钥**连阿里云，不用密码，正好配合这次整改。

---

## 1. 采购清单（30 台设备规模）

30 台 × 约 0.4~0.5 GB/天 ≈ **12~15 GB/天 ≈ 5 TB/年**。存 3 年 ≈ 15~18 TB。

| 部件 | 建议 | 说明 |
| --- | --- | --- |
| 主机 | 二手品牌塔式（Dell PowerEdge T430/T440 等），32GB ECC，多盘位 | 结实、带远程管理，可放办公室 |
| 数据盘 | **全新** 2× 16TB **CMR/NAS 级**（酷狼 / 西数红盘 Plus / 东芝 N300） | 组 ZFS 镜像，坏一块不丢数据 |
| 系统盘 | 1~2× 廉价 NVMe 256GB（两块可镜像系统盘，非必须） | 装 Ubuntu，和数据盘分开 |
| UPS | 后备式 650~1000VA | 防突然断电损坏数据库，**不能省** |
| 冷备盘 | 2× 普通大容量盘，轮换离线冷备 | 镜像≠备份，见阶段 E |

**买盘红线：必须是 CMR（垂直记录），坚决避开 SMR（叠瓦盘）**——SMR 在 ZFS 重建时可能慢到超时被踢出阵列，恰好在最需要它的时候掉链子。买前查清具体型号。两块盘建议不同批次/品牌，避免同时坏。

---

## 2. 阶段 A：从 MacBook 装 Ubuntu Server

### A1. 在 macOS 上做启动 U 盘

1. 下载 **Ubuntu Server 24.04 LTS** 的 ISO：<https://ubuntu.com/download/server>
2. 下载 **balenaEtcher**（macOS 版，免费图形工具）：<https://etcher.balena.io>
3. 插一个 ≥8GB 的 U 盘，打开 Etcher → 选 ISO → 选 U 盘 → Flash，写完拔下。

> 不想装软件也可以用命令行：`diskutil list` 找到 U 盘编号（如 disk4），然后
> `diskutil unmountDisk /dev/disk4 && sudo dd if=ubuntu-24.04-live-server-amd64.iso of=/dev/rdisk4 bs=4m status=progress`。
> **看清编号再执行，dd 写错盘无法挽回**；不确定就用 Etcher。

### A2. 装系统

1. 服务器**先只插系统盘（NVMe）**，两块 16TB 数据盘**暂时不插**（避免装系统时误格式化，装完再插最稳妥）。
2. 插 U 盘开机，进 BIOS 设为 U 盘启动（品牌机通常开机按 F2/F12/Del）。
3. Ubuntu 安装向导里：
   - 语言/键盘默认即可。
   - 网络：给服务器设**固定内网 IP**（例如 `192.168.1.50`），后面所有连接都用它。
   - 存储：选 NVMe 系统盘，用默认整盘 + LVM 即可（数据不放这）。
   - 建一个管理员账号，比如 `hmas`。
   - **勾选 "Install OpenSSH Server"** ← 关键，这样才能从 MacBook 远程连。
4. 装完重启，拔 U 盘。屏幕会显示登录提示，记下它的 IP。

### A3. 从 MacBook 远程连上去

打开 macOS 的 **终端**（访达 → 应用程序 → 实用工具 → 终端，或 Spotlight 搜 "终端"）：

```bash
ssh hmas@192.168.1.50
```

首次问指纹输 `yes`，再输密码即可登入。**之后所有操作都在这个 SSH 窗口里做。**

> 建议顺手配 SSH 密钥登录，以后免密码（macOS 自带这两个命令）：
>
> ```bash
> ssh-keygen -t ed25519          # 一路回车
> ssh-copy-id hmas@192.168.1.50  # 输一次密码，之后免密
> ```
>
> 再往 MacBook 的 `~/.ssh/config` 里加几行，以后连服务器只需敲 `ssh hmas-db`：
>
> ```
> Host hmas-db
>     HostName 192.168.1.50
>     User hmas
> ```

先更新系统：

```bash
sudo apt update && sudo apt -y upgrade
```

---

## 3. 阶段 B：装 ZFS，组镜像池

**现在关机，插上两块 16TB 数据盘，再开机。**

### B1. 装 ZFS

```bash
sudo apt -y install zfsutils-linux
```

### B2. 找到两块数据盘的稳定名字

**不要用 `/dev/sdb` 这种名字**（重启会变），用 `/dev/disk/by-id/` 下的稳定标识：

```bash
ls -l /dev/disk/by-id/ | grep -v part
```

找出两块 16TB 盘对应的 `ata-...` 或 `wwn-...` 名字（避开系统 NVMe）。假设是：

```
ata-ST16000_XXXX
ata-WDC_WD160_YYYY
```

### B3. 建镜像池

```bash
sudo zpool create -o ashift=12 -O compression=lz4 -O atime=off \
  tank mirror \
  /dev/disk/by-id/ata-ST16000_XXXX \
  /dev/disk/by-id/ata-WDC_WD160_YYYY
```

- `tank` 是池名，随意。
- `ashift=12` 对齐 4K 扇区（现代硬盘必须）。
- `mirror` = 镜像：坏任何一块盘数据都在。

检查：

```bash
zpool status tank
zpool list
```

看到 `state: ONLINE` 且两块盘都在 `mirror-0` 下即成功。

### B4. 给数据库单独建一个数据集并调优

```bash
# PostgreSQL 数据专用数据集，按 PG 页面调 recordsize
sudo zfs create -o recordsize=16K -o logbias=throughput tank/pgdata
# 备份/导出用数据集
sudo zfs create tank/exports
sudo zfs create tank/backup
```

---

## 4. 阶段 C：装 PostgreSQL + TimescaleDB

技术栈和阿里云端保持一致，将来 `docker-compose` 两边通用。

### C1. 安装

```bash
sudo apt -y install postgresql postgresql-contrib
# TimescaleDB（官方源）
sudo sh -c "echo 'deb https://packagecloud.io/timescale/timescaledb/ubuntu/ $(lsb_release -c -s) main' > /etc/apt/sources.list.d/timescaledb.list"
wget --quiet -O - https://packagecloud.io/timescale/timescaledb/gpgkey | sudo gpg --dearmor -o /etc/apt/trusted.gpg.d/timescaledb.gpg
sudo apt update
sudo apt -y install timescaledb-2-postgresql-16
sudo systemctl stop postgresql
sudo timescaledb-tune --yes     # 自动按内存调 postgresql.conf
```

### C2. 把 PostgreSQL 数据搬到 ZFS 数据集

```bash
sudo systemctl stop postgresql
sudo rsync -av /var/lib/postgresql/16/main/ /tank/pgdata/main/
sudo chown -R postgres:postgres /tank/pgdata
# 改数据目录
sudo sed -i "s#^data_directory.*#data_directory = '/tank/pgdata/main'#" /etc/postgresql/16/main/postgresql.conf
```

在 `postgresql.conf` 里追加（ZFS 上的常见优化）：

```conf
# ZFS 是写时复制，可关掉全页写以省 WAL（配合 UPS 使用）
full_page_writes = off
```

启动：

```bash
sudo systemctl start postgresql
sudo -u postgres psql -c "SELECT version();"
```

### C3. 建库、建表、开 TimescaleDB

```bash
sudo -u postgres createuser hmas
sudo -u postgres createdb hmas -O hmas
sudo -u postgres psql -c "ALTER USER hmas WITH PASSWORD '换成强密码';"
```

用仓库里现成的 schema 建表（把仓库 clone 到服务器，或把 `cloud-server/sql/` 拷过去）：

```bash
psql "postgres://hmas:换成强密码@127.0.0.1/hmas" -f cloud-server/sql/schema.sql
psql "postgres://hmas:换成强密码@127.0.0.1/hmas" -f cloud-server/sql/timescaledb_optional.sql
```

### C4. 分级保留（省一半硬盘的关键）

`fft_summary`（趋势指标）很小，永久留；`fft_spectrum`（完整频谱）占大头、老数据几乎不看，只留 1~2 年。用 TimescaleDB 保留策略：

```sql
-- 完整频谱只留 730 天，到期整块 chunk 丢弃（O(1)，不产生表膨胀）
SELECT add_retention_policy('fft_spectrum', INTERVAL '730 days');
-- ingest 日志留 90 天
SELECT add_retention_policy('device_ingest_log', INTERVAL '90 days');
-- fft_summary 不设保留策略 = 永久保存
```

---

## 5. 阶段 D：每晚从阿里云拉取数据

采用 README 里定的"公司服务器主动拉取"模型：公司服务器发起 SSH，阿里云不需要开放数据库端口。

### D1. 配免密 SSH（用密钥，不用密码）

在**公司服务器**上：

```bash
ssh-keygen -t ed25519 -f ~/.ssh/aliyun_pull -N ''
ssh-copy-id -i ~/.ssh/aliyun_pull.pub root@8.148.228.136   # 首次需阿里云密码，之后免密
```

> 借这一步把阿里云改成**仅密钥登录**：编辑阿里云 `/etc/ssh/sshd_config` 设 `PasswordAuthentication no` 并重启 sshd。这样之前泄漏的 root 密码即使没改也无法再用密码登录（但仍**强烈建议改密码**）。

### D2. 拉取脚本

把下面存成公司服务器上的 `~/hmas-pull.sh`：

```bash
#!/usr/bin/env bash
set -euo pipefail

ALIYUN="root@8.148.228.136"
KEY="$HOME/.ssh/aliyun_pull"
LOCAL_DB="postgres://hmas:换成强密码@127.0.0.1/hmas"
EXPORT_DIR="/tank/exports"
DAY="$(date -d 'yesterday' +%F)"            # 拉昨天整天
FROM="${DAY} 00:00:00+08"
TO="${DAY} 23:59:59+08"
OUT="${EXPORT_DIR}/${DAY}"
mkdir -p "$OUT"

echo "[$(date)] 拉取 ${DAY} 数据..."

# 逐表用 COPY 导出为 CSV（在阿里云上执行，结果流回本地文件）
for T in fft_summary fft_spectrum alarm_events device_ingest_log; do
  ssh -i "$KEY" "$ALIYUN" \
    "sudo -u postgres psql hmas -c \"\\copy (SELECT * FROM ${T} WHERE ts >= '${FROM}' AND ts <= '${TO}') TO STDOUT WITH CSV\"" \
    > "${OUT}/${T}.csv"
done

# 生成校验和
( cd "$OUT" && sha256sum *.csv > manifest.sha256 )

# 校验
( cd "$OUT" && sha256sum -c manifest.sha256 )

# 导入本地库
for T in fft_summary fft_spectrum alarm_events device_ingest_log; do
  psql "$LOCAL_DB" -c "\copy ${T} FROM '${OUT}/${T}.csv' WITH CSV"
done

echo "[$(date)] ${DAY} 完成，共 $(du -sh "$OUT" | cut -f1)"
```

> 说明：`fft_spectrum.spectrum_db` 是 bytea，CSV 里会是 `\x...` 十六进制文本，导回同一张 bytea 列能原样还原。若某表当天可能重复导入，可先按 `(device_id, ts, channel_id)` 去重或改用 `ON CONFLICT`——需要的话我把去重版脚本补上。

### D3. 设成每晚定时任务

```bash
chmod +x ~/hmas-pull.sh
crontab -e
```

加一行（每天凌晨 3:30 拉前一天，日志留档）：

```cron
30 3 * * * /home/hmas/hmas-pull.sh >> /home/hmas/hmas-pull.log 2>&1 || echo "HMAS 拉取失败 $(date)" | tee -a /home/hmas/hmas-pull.err
```

**失败要能被人看到**：把上面 `|| ...` 换成发邮件/企业微信/钉钉 webhook 通知（告诉我用哪个，我写进去）。夜间拉取一旦静默失败、阿里云又只留 7 天，数据会永久丢失——这是整条链路最需要盯的环节。

---

## 6. 阶段 E：冷备份 + 快照（镜像≠备份）

ZFS 镜像只防**硬盘坏**，不防误删、脚本 bug、勒索软件、火灾、失窃。这台机器是全部历史的**唯一副本**，冷备是最后防线。

### E1. 每日自动快照（防误删，秒级零成本）

```bash
sudo apt -y install zfs-auto-snapshot
# 默认会自动建 hourly/daily/weekly 快照，误删后可 zfs rollback 或从 .zfs/snapshot 里捞
```

### E2. 每月冷备到离线盘（放到另一个房间）

插入冷备盘，一次性建个备份池（只在插入时导入）：

```bash
# 首次：给冷备盘建池（假设 by-id 为 ata-COLD_ZZZZ）
sudo zpool create coldbak /dev/disk/by-id/ata-COLD_ZZZZ
```

每月备份（ZFS 增量发送，比 rsync 严谨）：

```bash
# 打一个带日期的快照并增量发送到冷备池
SNAP="tank/pgdata@bak-$(date +%F)"
sudo zfs snapshot -r "$SNAP"
sudo zfs send -R "$SNAP" | sudo zfs receive -F coldbak/pgdata
sudo zpool export coldbak       # 导出后拔下，离线保存
```

**两块冷备盘轮换**：这个月用 A、下个月用 B，始终有一块在保险柜/别的房间。

---

## 7. 阶段 F：监控告警（坏了得有人知道）

镜像最常见的死法是"第一块盘早坏了没人发现，裸奔几个月后第二块也坏"。所以告警不是可选项。

### F1. ZFS 事件通知

```bash
sudo apt -y install zfs-zed
# 编辑 /etc/zfs/zed.d/zed.rc，填 ZED_EMAIL_ADDR 收告警邮件
```

### F2. 硬盘健康监测

```bash
sudo apt -y install smartmontools
sudo systemctl enable --now smartd
# 每周做一次 SMART 长测
sudo smartctl -t long /dev/disk/by-id/ata-ST16000_XXXX
```

### F3. 每月一次 ZFS scrub（免费的数据体检）

```bash
sudo systemctl enable --now zfs-scrub-monthly@tank.timer   # 定时校验+自愈静默损坏
# 手动：sudo zpool scrub tank
```

---

## 8. 日常运维速查表

| 目的 | 命令（在 MacBook 终端里 `ssh hmas-db` 登入后执行） |
| --- | --- |
| 看池健康 | `zpool status tank` |
| 看容量/压缩率 | `zpool list` / `zfs get compressratio tank` |
| 手动 scrub | `sudo zpool scrub tank` |
| 换坏盘 | `sudo zpool replace tank 旧盘id 新盘id`，再 `zpool status` 看 resilver 进度 |
| 看快照 | `zfs list -t snapshot` |
| 误删回滚 | `sudo zfs rollback tank/pgdata@zfs-auto-snap_daily-...` |
| 看昨晚拉取日志 | `tail -f ~/hmas-pull.log` |
| 数据库大小 | `psql "$LOCAL_DB" -c "\l+"` |

---

## 9. 上线前安全检查清单

- [ ] 阿里云 root **改密码**（旧密码已泄漏在 `check-aliyun-status.sh`）
- [ ] 阿里云 sshd 改 **仅密钥登录**（`PasswordAuthentication no`）
- [ ] 轮换 **ADMIN_TOKEN** 和每台设备 **secret**（旧值已进 git 历史）
- [ ] PostgreSQL 只监听内网，不把 5432 暴露公网
- [ ] UPS 接好并测试断电自动安全关机
- [ ] 冷备盘首次备份完成，且已离线放到**另一个房间**
- [ ] 告警邮件/webhook 收到过一次测试通知（确认告警真的通）
- [ ] 手动断开一块数据盘做过一次"坏盘演练"，确认池降级不丢数据、换盘能 resilver

---

## 附：容量与扩容

- 2×16TB 镜像 = 可用 ~16TB，30 台设备约够 **3 年**。
- 满了怎么扩：ZFS 支持在线加一组镜像 `sudo zpool add tank mirror 新盘1 新盘2`，容量翻倍，不用动现有数据。
- 配合阶段 C4 的"完整频谱只留 1~2 年"，实际能撑更久。

> 需要我把阶段 D 的拉取脚本、告警通知、`docker-compose`（postgres+timescaledb 一键起）落成仓库里的实际文件，告诉我即可。
