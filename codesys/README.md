# CODESYS TCP 上传程序 - HMAS

这个目录是 PLC 端程序。当前方案不再让本地网页直接连接 CODESYS，也不上传 10 kHz 原始数据。

数据链路：

```text
CODESYS 控制器
  - 模拟传感器或现场 IO
  - 本地计算 FFT
  - 只上传 V02/S01 的 FFT 结果
        |
        | TCP 9100
        v
阿里云服务 8.148.228.136
  - TCP Server 接收
  - deviceId/secret 鉴权
  - 解析 HMF1 二进制 FFT
  - int16 + zlib 压缩入库
  - WebSocket 转发给本地网页实时显示
```

## 当前默认参数

| 项目 | 值 |
| --- | --- |
| 云服务器 | `8.148.228.136` |
| TCP 端口 | `9100` |
| CODESYS 设备 ID | `HMAS-002` |
| 云端模拟器设备 ID | `HMAS-001` |
| 设备密钥 | `change-this-device-secret` |
| 采样率 | `10000 Hz` |
| FFT 点数 | `2048` |
| 频谱 bin 数 | `1024` |
| 上传通道 | `V02` 振动、`S01` 声学 |
| 上传周期 | 每秒 1 次，每次 2 帧 |
| 单设备带宽 | 约 `35.2 kbps` payload，含 TCP/IP 后约 `40-45 kbps` |

参数在 [GVL_HmasChannels.iecst](/Users/pengbo/PycharmProjects/PythonProject/hydraulic-monitor-analysis-software/codesys/POUs/GVL_HmasChannels.iecst) 里修改。

## 新增程序文件

已生成可直接导入 CODESYS 的 PLCopen XML：

```text
codesys/HMAS_Codesys_TCP_Client.plcopen.xml
```

推荐在 CODESYS 里用：

```text
Project -> Import PLCopenXML...
```

选择上面的 XML 文件导入。导入后仍需要在 Library Manager 里添加下面的库，并把 `PLC_PRG` 挂到周期任务。

导入后只出现下面这几个对象是正常的。其他 `HmasWrite*`、`FB_HmasBinaryFftBuilder`、旧 WebSocket 文件都不是当前 TCP 方案必须对象。

| 文件 | 类型 | 作用 |
| --- | --- | --- |
| `E_HmasCloudState.iecst` | DUT Enumeration | 云端 TCP 客户端状态机 |
| `GVL_HmasChannels.iecst` | GVL | 通道值、FFT 数组、云端配置、诊断变量 |
| `HmasPeakShape.iecst` | Function | 模拟 FFT 峰形 |
| `FB_HmasSensorSimulator.iecst` | FB | 模拟 CH01-CH08、F01、F02、V01、V02、S01 和 FFT 频谱 |
| `FB_HmasCloudTcpClient.iecst` | FB | TCP 连接、hello 鉴权、HMF1 打包、FFT 发送、ACK 读取、断线重连 |
| `PLC_PRG.iecst` | PRG | 主程序，调用模拟器和云端客户端 |

旧的 WebSocket 文件仍保留在目录中作为历史参考，但当前主程序不再调用：

```text
E_WsState.iecst
FB_HmasWebSocketServer.iecst
FB_HmasFrameBuilder.iecst
FB_Sha1.iecst
FB_Base64Encoder.iecst
```

## CODESYS 依赖库

| 库 | 命名空间 | 用途 |
| --- | --- | --- |
| CAA Net Base Services | `NBS` | `TCP_Client`, `TCP_Read`, `TCP_Write` |
| CAA Types Extern | `CAA` | `CAA.HANDLE` 网络连接句柄 |
| Standard | 默认 | `TON`, `SIN`, 字符串和基础类型 |

这些库不需要 MQTT，也不需要付费 MQTT 组件。

## 导入顺序

推荐直接导入：

```text
codesys/HMAS_Codesys_TCP_Client.plcopen.xml
```

当前 XML 为简化导入版，不依赖独立的 `HmasWrite*` helper 函数，也不依赖 `FB_HmasBinaryFftBuilder`。如果 PLCopen XML 导入失败，再按下面顺序手动创建/粘贴：

1. `E_HmasCloudState.iecst`，类型选择 DUT -> Enumeration
2. `GVL_HmasChannels.iecst`，类型选择 GVL
3. `HmasPeakShape.iecst`
4. `FB_HmasSensorSimulator.iecst`，类型选择 Function Block
5. `FB_HmasCloudTcpClient.iecst`，类型选择 Function Block
6. `PLC_PRG.iecst`，替换默认主程序

任务配置建议：

```text
Application -> Task Configuration -> MainTask
Type: Cyclic
Interval: T#10MS
Priority: 1
POU: PLC_PRG
```

## 运行逻辑

默认 `GVL_HmasChannels.xUseSimulator := TRUE`，没有现场传感器时 PLC 会自动生成模拟数据：

- `CH01` 主泵出口压力，约 220 bar
- `CH02` 辅助压力，约 210 bar
- `CH03` 蓄能器压力，约 186 bar
- `CH04` 回油压力，约 14 bar
- `CH05` 油温，约 53 C
- `CH06` 回油温度，约 63 C
- `CH07/CH08` 位移/阀位
- `F01` 流量，约 128 L/min
- `F02` 油液清洁度简化值
- `V01` 转速，约 1500 rpm
- `V02` 振动 RMS，约 0.40 g
- `S01` 声学 SPL，约 72 dB

模拟器每 100 ms 更新通道值和频谱。TCP 客户端鉴权成功后每 1 秒上传：

```text
V02 一帧 HMF1 FFT
S01 一帧 HMF1 FFT
```

## 云端协议

连接建立后，PLC 先发送 hello：

```json
{"v":1,"type":"hello","deviceId":"HMAS-002","secret":"change-this-device-secret","ts":1719300000000}
```

外层帧格式：

```text
[4 字节 big-endian payload 长度][payload]
```

hello 通过后，FFT payload 使用 `HMF1` 二进制格式：

```text
magic/version/channel/seq/timestamp/sampleRate/fftSize/binCount
rms/peak/crestFactor/thd
bearing markers
channel values CH01..S01
1024 个 int16 频谱 bin，单位 dB * 10
```

完整协议以 [cloud-server/src/protocol.js](/Users/pengbo/PycharmProjects/PythonProject/hydraulic-monitor-analysis-software/cloud-server/src/protocol.js) 为准。

## 诊断变量

在 CODESYS 在线监控里看这些变量：

| 变量 | 含义 |
| --- | --- |
| `GVL_HmasChannels.eCloudState` | TCP 状态机 |
| `GVL_HmasChannels.xCloudConnected` | TCP 是否连接 |
| `GVL_HmasChannels.xCloudAuthenticated` | hello 是否鉴权成功 |
| `GVL_HmasChannels.udiCloudFramesSent` | 已发送 FFT 帧数，不含 hello |
| `GVL_HmasChannels.udiCloudBytesSent` | 已发送字节数，含 hello 和 FFT |
| `GVL_HmasChannels.udiCloudReconnects` | 断线重连次数 |
| `GVL_HmasChannels.sCloudLastError` | 最近错误 |

正常状态：

```text
eCloudState = READY
xCloudConnected = TRUE
xCloudAuthenticated = TRUE
udiCloudFramesSent 每秒增加 2
```

## 切换到现场传感器

现场 IO 接好后，把：

```structuredtext
GVL_HmasChannels.xUseSimulator := FALSE;
```

然后在 [PLC_PRG.iecst](/Users/pengbo/PycharmProjects/PythonProject/hydraulic-monitor-analysis-software/codesys/POUs/PLC_PRG.iecst) 的生产逻辑区写入：

```structuredtext
GVL_HmasChannels.rCH01 := ...;
GVL_HmasChannels.rV02 := ...;
GVL_HmasChannels.rS01 := ...;
GVL_HmasChannels.aiV02Spectrum[0] := ...;   // dB * 10
GVL_HmasChannels.aiS01Spectrum[0] := ...;   // dB * 10
GVL_HmasChannels.xChannelsValid := TRUE;
```

注意：CODESYS 端仍然只上传 FFT 后的数据，不上传 10 kHz 全量原始采样。

## 可能需要按目标设备微调的位置

不同 CODESYS runtime 的 `CAA Net Base Services` 版本可能有轻微差异。若编译时报网络 FB 形参名不一致，优先检查：

- [FB_HmasCloudTcpClient.iecst](/Users/pengbo/PycharmProjects/PythonProject/hydraulic-monitor-analysis-software/codesys/POUs/FB_HmasCloudTcpClient.iecst) 里的 `NBS.TCP_Client`
- `NBS.TCP_Read`
- `NBS.TCP_Write`

当前写法按 CODESYS 在线帮助的 NBS 3.5.17 接口编写。

## HMAS-001 和 HMAS-002 对比

当前默认安排：

- `HMAS-001`：阿里云服务自带模拟器继续使用
- `HMAS-002`：CODESYS 控制器上传使用

这样管理页面里可以同时看 001 和 002 两台设备，方便对比模拟器和控制器上传的数据。

如果云端数据库还没有注册 `HMAS-002`，需要在云端执行一次：

```bash
cd /opt/hmas-cloud-server
npm run register-device -- HMAS-002 change-this-device-secret
```
