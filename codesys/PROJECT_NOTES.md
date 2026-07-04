# CODESYS 工程导入步骤

## 推荐版本

- CODESYS Development System V3.5 SP18 或更高
- 支持 `CAA Net Base Services` 的 runtime，例如：
  - CODESYS Control Win V3 / Control Win SL
  - CODESYS Control for Linux SL
  - 目标 PLC 厂商提供的 CODESYS runtime

## 创建工程

1. File -> New Project -> Standard project
2. Device 选择目标 runtime
3. `PLC_PRG` 语言选择 Structured Text

## 添加库

Library Manager -> Add library：

| 库 | 命名空间 |
| --- | --- |
| `CAA Net Base Services` | `NBS` |
| `CAA Types Extern` | `CAA` |
| `Standard` | 默认 |

本方案不使用 MQTT，因此不需要付费 MQTT 库。

## 导入 POU

优先使用 PLCopen XML 导入：

```text
Project -> Import PLCopenXML...
选择 codesys/HMAS_Codesys_TCP_Client.plcopen.xml
```

这个 XML 已包含：

- `E_HmasCloudState`
- `GVL_HmasChannels`
- `HmasPeakShape`
- `FB_HmasSensorSimulator`
- `FB_HmasCloudTcpClient`
- `PLC_PRG`

所以导入后只看到这几个对象是正常的。旧 helper 和旧 WebSocket 对象不用导入。

如果目标 CODESYS 版本对 PLCopen XML 兼容不好，再按顺序创建对应对象，然后把 `.iecst` 内容粘贴进去：

| 文件 | CODESYS 类型 |
| --- | --- |
| `E_HmasCloudState.iecst` | DUT -> Enumeration |
| `GVL_HmasChannels.iecst` | GVL |
| `HmasPeakShape.iecst` | Function |
| `FB_HmasSensorSimulator.iecst` | FB |
| `FB_HmasCloudTcpClient.iecst` | FB |
| `PLC_PRG.iecst` | PRG，替换默认 `PLC_PRG` |

旧 WebSocket 文件可以不导入。当前主程序不依赖它们。

## 配置云端参数

打开 `GVL_HmasChannels`：

```structuredtext
xCloudEnable := TRUE;
sCloudHost := '8.148.228.136';
uiCloudPort := 9100;
sDeviceId := 'HMAS-002';
sDeviceSecret := 'change-this-device-secret';
xUseSimulator := TRUE;
```

如果云端设备密钥改了，PLC 这里必须同步修改。

当前 `HMAS-001` 保留给阿里云模拟器，CODESYS 默认使用 `HMAS-002`。如果云端还没注册 002，在云端执行：

```bash
cd /opt/hmas-cloud-server
npm run register-device -- HMAS-002 change-this-device-secret
```

## 任务配置

Application -> Task Configuration -> MainTask：

```text
Type: Cyclic
Interval: T#10MS
Priority: 1
POU: PLC_PRG
```

## 编译下载

1. Build -> Build
2. Online -> Login
3. Debug -> Start

启动后观察：

```text
GVL_HmasChannels.eCloudState
GVL_HmasChannels.xCloudConnected
GVL_HmasChannels.xCloudAuthenticated
GVL_HmasChannels.udiCloudFramesSent
GVL_HmasChannels.sCloudLastError
```

正常应为：

```text
xCloudConnected = TRUE
xCloudAuthenticated = TRUE
eCloudState = READY
udiCloudFramesSent 每秒增加 2
```

## 云端验证

本地网页只负责实时查看，地址仍然连接阿里云 HTTP/WebSocket：

```text
http://8.148.228.136:8080/
http://8.148.228.136:8080/admin
```

管理页面可以看设备在线状态、模拟器状态和数据库数据。

## 常见问题

| 现象 | 检查项 |
| --- | --- |
| 一直 CONNECTING | PLC 到公网 `8.148.228.136:9100` 是否能出站访问 |
| `auth failed` | `sDeviceId` 或 `sDeviceSecret` 和云端数据库不一致 |
| `hello_ack timeout` | 9100 端口未通、防火墙拦截、云端服务未运行 |
| `TCP_Write error` | 网络断开或云端主动关闭连接 |
| 云端没有实时数据 | `xChannelsValid` 是否 TRUE，`udiCloudFramesSent` 是否增长 |

## 接真实传感器

接入现场 IO 后：

1. 把 `xUseSimulator` 改为 `FALSE`
2. 在 `PLC_PRG` 的生产逻辑区写真实通道值
3. 在 PLC 端完成 FFT
4. 把 V02/S01 频谱写入：

```structuredtext
GVL_HmasChannels.aiV02Spectrum[i] := REAL_TO_INT(rVibrationDb * 10.0);
GVL_HmasChannels.aiS01Spectrum[i] := REAL_TO_INT(rSoundDb * 10.0);
```

每个数组固定 1024 个 bin，对应 `fftSize=2048`、`sampleRate=10000`。
