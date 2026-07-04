# HMAS TCP 云端服务接入说明

本文档对应仓库中的 `cloud-server/` 和前端新增的 `Cloud` 数据源。

## 架构

```text
CODESYS TCP Client
  -> cloud-server TCP 9100
  -> PostgreSQL / TimescaleDB
  -> HTTP API 8080
  -> WebSocket /ws/live
  -> 本地 Vue HTML Cloud 数据源，只负责实时查看和手动导出
  -> /admin 数据库管理网页
  <- 公司数据服务器定时主动拉取备份
  -> 公司 PostgreSQL/TimescaleDB + RAID 长期保存
```

## 1. 初始化数据库

推荐 PostgreSQL + TimescaleDB。创建数据库后执行：

```bash
cd cloud-server
psql "$DATABASE_URL" -f sql/schema.sql
```

如果暂时不用 TimescaleDB，需要把 `sql/schema.sql` 中的：

```sql
CREATE EXTENSION IF NOT EXISTS timescaledb;
SELECT create_hypertable(...);
```

删除或注释掉，再执行建表。

## 2. 配置云端服务

```bash
cd cloud-server
npm install
cp .env.example .env
```

编辑 `.env`：

```env
DATABASE_URL=postgres://hmas:hmas_password@127.0.0.1:5432/hmas
TCP_PORT=9100
HTTP_PORT=8080
HOST=0.0.0.0
DEVICE_ID=HMAS-001
DEVICE_SECRET=change-this-device-secret
ADMIN_TOKEN=replace-with-a-long-random-token
```

注册设备：

```bash
npm run register-device
```

启动服务：

```bash
npm start
```

## 3. TCP 协议

每个 TCP 包：

```text
[4 字节大端 payload 长度][payload]
```

第一包必须是 JSON `hello`：

```json
{
  "v": 1,
  "type": "hello",
  "deviceId": "HMAS-001",
  "secret": "change-this-device-secret",
  "ts": 1719300000000
}
```

鉴权通过后，FFT 数据包改为二进制 `HMF1`。CODESYS 不需要做 zlib，只需要把 dB 频谱量化为 `INT16`：

```text
int16_value = round(db_value * 10)
```

二进制 payload 布局如下。除最外层 4 字节长度是大端外，payload 内多字节字段统一小端：

```text
offset  size  类型       字段
0       4     char[4]    magic = "HMF1"
4       1     uint8      version = 1
5       1     uint8      channel_id_length
6       2     uint16     flags = 0
8       4     uint32     seq
12      8     uint64     timestamp_ms
20      4     uint32     sample_rate
24      2     uint16     fft_size
26      2     uint16     bin_count = fft_size / 2
28      2     int16      db_scale = 10
30      2     int16      reserved = 0
32      4     real32     rms
36      4     real32     peak
40      4     real32     crest_factor
44      4     real32     thd
48      4     real32     bpfi_hz，无值填 NaN
52      4     real32     bpfi_db，无值填 NaN
56      4     real32     bpfo_hz，无值填 NaN
60      4     real32     bpfo_db，无值填 NaN
64      4     real32     bsf_hz，无值填 NaN
68      4     real32     bsf_db，无值填 NaN
72      4     real32     ftf_hz，无值填 NaN
76      4     real32     ftf_db，无值填 NaN
80      16    char[16]   channel_id ASCII，不足补 0
96      52    real32[]   CH01..CH08,F01,F02,V01,V02,S01，无值填 NaN
148     N*2   int16[]    频谱 bin，单位 dB * db_scale
```

说明：

- `fftSize=2048` 时，`bin_count=1024`，单帧 FFT payload 为 `2196` 字节，再加 4 字节长度头。
- V02 和 S01 每秒各 1 帧时，单台控制器上传约 `35 kbps`。
- 周期 FFT 可以允许少量丢包，使用 `seq` 监控缺号。
- 云端数据库保存完整频谱时使用 `int16 + zlib` 压缩后写入 `bytea`，
  HTTP/WebSocket 返回给前端时仍是普通 `spectrumDb` 数组。

## 4. 本地模拟发送

没有 CODESYS 时，可以用测试脚本模拟一帧 FFT：

```bash
cd cloud-server
npm run send-sample -- 127.0.0.1 9100
```

## 5. HTTP API

```text
GET http://server:8080/health
GET http://server:8080/api/latest?deviceId=HMAS-001
GET http://server:8080/api/history?deviceId=HMAS-001&channelId=V02&limit=200
GET http://server:8080/api/spectrum?deviceId=HMAS-001&channelId=V02&limit=20
GET http://server:8080/api/alarms?deviceId=HMAS-001&limit=100
```

## 6. 数据库管理网页

云端服务内置一个简单管理页面：

```text
http://<阿里云服务器IP>:8080/admin
```

功能：

- 查看服务状态、数据库连接池、模拟器状态。
- 查看 `devices`、`fft_summary`、`fft_spectrum`、`alarm_events`、`device_ingest_log` 的行数、时间范围和占用空间。
- 查看各表最新数据。
- 执行只读 SQL，限制为 `SELECT`、`WITH`、`EXPLAIN`，最多返回 500 行。
- 按时间清理历史表旧数据。
- 启动或停止云端模拟器。

管理接口需要 `.env` 里的 `ADMIN_TOKEN`。网页会把 Token 放在请求头：

```text
Authorization: Bearer <ADMIN_TOKEN>
```

不要把 PostgreSQL 用户名和密码放到浏览器里；网页只访问云端服务的受控 API。

## 7. 频谱压缩存储

`fft_summary` 保存 RMS、Peak、主频、Top peaks 等摘要指标，适合趋势查询。
`fft_spectrum` 保存完整频谱曲线，已经改为压缩存储：

```text
spectrumDb number[] -> int16，0.1 dB 精度 -> zlib deflate -> PostgreSQL bytea
```

旧 JSON 频谱数据可删除并迁移到新结构：

```bash
cd cloud-server
psql "$DATABASE_URL" -f sql/migrate_spectrum_int16_zlib.sql
```

迁移脚本会清空 `fft_summary` 和 `fft_spectrum`，然后模拟器或 CODESYS 新上传的数据会按压缩格式重新入库。

## 8. 公司服务器主动备份

公司数据服务器没有公网 IP 时，不需要阿里云主动访问公司内网。推荐由公司服务器每天晚上主动连接阿里云拉取数据：

```text
阿里云 PostgreSQL 暂存 3~7 天
公司服务器 cron
  -> SSH 登录阿里云
  -> 导出昨天 00:00:00 ~ 23:59:59 数据
  -> 生成 manifest.json 和 sha256
  -> 下载压缩数据包
  -> 校验后导入公司长期数据库
  -> 阿里云只删除 7 天前数据
```

安全建议：

- 不要把阿里云 PostgreSQL `5432` 暴露公网。
- 公司服务器只需要能访问公网，不需要公网 IP。
- 阿里云只开放 SSH、TCP 上传端口 `9100`、网页端口 `8080`。
- 备份成功后先校验行数和 sha256，再导入公司数据库。

按 40 台设备估算：

```text
每天数据：16 ~ 20 GB
每月数据：480 ~ 600 GB
```

阿里云出网计费对比：

```text
0.8 元/GB + 100 Mbps：约 384 ~ 480 元/月，夜间同步约 30 ~ 60 分钟
10 Mbps 包月 538.86 元/月：夜间同步约 4.5 ~ 6 小时
临界点：538.86 / 0.8 ≈ 674 GB/月
```

当前 40 台预计低于临界点，建议优先选 `0.8 元/GB + 100 Mbps`。如果实际长期超过 `700 GB/月`，再考虑固定带宽包月。

公司数据服务器建议：

```text
CPU：4 ~ 8 核
内存：16 ~ 32 GB
数据库：PostgreSQL + TimescaleDB 或按天分区
存储：RAID6 偏容量和安全，RAID10 偏性能
容量：40 台约 6 ~ 8 TB/年，建议按 8 ~ 10 TB/年规划
```

## 9. 前端连接

启动原有前端后，在实时或历史页面的数据源选择中选 `Cloud`：

```text
Base URL: http://<阿里云服务器IP>:8080
Device ID: HMAS-001
```

点击连接后：

- 实时数据走 `ws://<server>:8080/ws/live?deviceId=HMAS-001`
- 历史数据走 `/api/history`
- 频谱页会直接显示云端上传的 FFT，不再用浏览器本地 worker 重新计算
- 本地网页只负责实时查看、历史查询、截图/CSV 手动导出，不承担长期本地存储

## 10. 阿里云安全组

至少开放：

```text
9100/tcp  CODESYS 控制器上传
8080/tcp  本地 HTML/Vue 查询和 WebSocket
```

生产环境建议：

- 8080 前面加 Nginx HTTPS 反代。
- 9100 只允许现场公网出口 IP 访问。
- 定期更换 `DEVICE_SECRET`。
- 定期更换 `ADMIN_TOKEN`，不要使用短 token。
