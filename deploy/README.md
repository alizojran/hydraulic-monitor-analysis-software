# 树莓派部署 · Raspberry Pi Deployment

HMAS 是**纯静态 SPA**(无后端)。部署 = 构建出 `v2/dist/` 静态文件 → 树莓派用 nginx 托管 → 浏览器打开。
真实传感器数据通过浏览器的 WebSerial / WebSocket / Modbus 数据源接入。

> The app is a **pure static SPA**. Deploying means building `v2/dist/` and serving
> it from the Pi with nginx; live sensor data flows in through the browser's
> WebSerial / WebSocket / Modbus data sources.

---

## 一、先选部署形态

| 形态                          | 场景                                                                   | WebSerial 可用性                              |
| ----------------------------- | ---------------------------------------------------------------------- | --------------------------------------------- |
| **A. Kiosk(现场一体机,推荐)** | 树莓派接触摸屏 + 传感器,开机自启 Chromium 全屏访问 `http://localhost/` | ✅ localhost 即安全上下文                     |
| **B. 局域网服务器**           | 树莓派只放网页,别的电脑/平板访问 `http://树莓派IP/`                    | ❌ HTTP + LAN IP 下 `navigator.serial` 不可用 |
| **C. B + HTTPS**              | 同 B 但配自签证书 `https://...`                                        | ✅                                            |

形态决定是否要 HTTPS、以及真机数据走哪条路(见第四节)。

---

## 二、构建(建议在 PC 上,别在树莓派上)

`dist/` 是跨平台静态产物,在 PC 上构建再拷过去,远快于在 ARM 上 `npm install + build`。

```bash
cd v2
npm ci
npm run build:pi          # = vue-tsc -b && BASE=/ vite build  → v2/dist/
```

> ⚠️ **base 路径**:默认 `vite.config.ts` 的 `base` 是给 GitHub Pages 用的子路径,
> 直接构建会导致树莓派上白屏(资源 404)。`build:pi` 已预置 `BASE=/`。
> 放子路径(如 `http://pi/hmas/`)则手动:`BASE=/hmas/ npm run build`。

---

## 三、部署到树莓派

### 方式 1:一键脚本(推荐)

把仓库(或至少 `v2/dist/` + `deploy/`)拷到树莓派后:

```bash
sudo ./deploy/setup-pi.sh           # 装 nginx + 部署 + 配置 + reload
# 现场一体机连同 kiosk 一起装:
sudo KIOSK=1 ./deploy/setup-pi.sh
```

脚本做了:安装 nginx → `rsync` dist 到 `/var/www/hmas` → 安装 `nginx-hmas.conf` →
`nginx -t` 校验并 reload →(可选)安装并启用 `hmas-kiosk.service`。

可用环境变量覆盖:`WEBROOT`、`DIST`、`KIOSK`。

### 方式 2:手动

```bash
# 在 PC 上把构建产物推到树莓派
rsync -av v2/dist/ pi@树莓派IP:/var/www/hmas/

# 在树莓派上
sudo apt update && sudo apt install -y nginx
sudo cp deploy/nginx-hmas.conf /etc/nginx/sites-available/hmas
sudo ln -sf /etc/nginx/sites-available/hmas /etc/nginx/sites-enabled/hmas
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx
```

打开 `http://树莓派IP/`(现场一体机用 `http://localhost/`)。

---

## 四、接入真实数据

数据源在右上角切换器选择,支持 `simulated / csv / wav / webserial / websocket / modbus`。

- **WebSerial(USB 串口直连)**:STM32/Arduino 采集板插树莓派 USB。仅 **Kiosk(localhost)或 HTTPS** 下可用。帧格式见 [`../docs/communication-protocols.md`](../docs/communication-protocols.md)。
- **WebSocket(网络场景首选)**:在树莓派上跑一个桥接程序读传感器/PLC,开 `ws://` 推 JSON 帧;浏览器选 websocket 连接。`ws://` 不受安全上下文限制,LAN 直连可用。参考 PLC 端实现:[`../codesys/`](../codesys/)。
- **Modbus**:浏览器不能直连 Modbus TCP,需经 Modbus→WebSocket 代理。

---

## 五、Kiosk 自启(形态 A)

```bash
sudo apt install -y chromium-browser
sudo cp deploy/hmas-kiosk.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now hmas-kiosk.service
```

需要图形会话(Raspberry Pi OS Desktop)。服务里 `User=pi`、`DISPLAY=:0`,如不同请改 `hmas-kiosk.service`。

---

## 六、必踩的坑 · Gotchas

1. **base 路径**:不用 `build:pi`(即没 `BASE=/`)→ 白屏。最常见错误。
2. **WebSerial 安全上下文**:`http://192.168.x.x/` 下 `navigator.serial` 是 undefined,UI 显示"不支持"。解决:Kiosk 走 localhost / 配 HTTPS / 改用 WebSocket。
3. **WebGL2 性能**:页面约 13 个 GL Canvas。建议**树莓派 4(2GB+)或 5**;Pi 3 吃力。确保 Chromium 启用 GPU。
4. **AI 故障诊断需外网**:浏览器直连 `api.anthropic.com`(BYOK)。纯内网下 AI 诊断不可用,但本地规则引擎诊断仍可用。
5. **数据存在浏览器**:设备档案 / 工况基线 / 告警规则都在浏览器 **localStorage**,不是树莓派磁盘。Kiosk 别用隐身模式或每次清缓存,否则基线丢失。迁移用配置页的 Profile JSON 导出/导入。
6. **更新版本**:重新 `npm run build:pi` → `rsync --delete` 覆盖 `/var/www/hmas` → 刷新浏览器(`index.html` 不缓存,资源带 hash,自动拿新版)。

---

## 七、最小可跑路径 · TL;DR

```bash
# PC
cd v2 && npm ci && npm run build:pi
rsync -av dist/ pi@PI_IP:/var/www/hmas/   # 或把 repo 拷过去跑 setup-pi.sh

# Pi
sudo ./deploy/setup-pi.sh                 # 现场一体机:sudo KIOSK=1 ./deploy/setup-pi.sh

# 浏览器 → http://PI_IP/   (Kiosk → http://localhost/)
```
