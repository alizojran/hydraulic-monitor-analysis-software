# CODESYS 工程导入步骤

## 推荐 CODESYS 版本

- CODESYS Development System V3.5 SP18 或更高
- CODESYS Control runtime（任选其一）：
  - Control Win V3 / Control Win SL（开发用）
  - Control RTE V3（实时机）
  - Control for Linux SL / Raspberry Pi SL

## 创建工程

1. **File → New Project → Standard project**
2. Device：选择上面的某个 runtime
3. PLC_PRG 语言：**Structured Text (ST)**

## 添加库

**Library Manager（双击工程树里的 Library Manager）→ Add library**

| 库                      | 命名空间                   |
| ----------------------- | -------------------------- |
| `CAA Net Base Services` | `NBS`                      |
| `CAA Memory`            | `MEM` （`SysMemCpy` 用）   |
| `Standard`              | `Standard`（默认已加）     |
| `Standard64`            | `Standard64`（ULINT 用）   |
| `SysTimeRtc`            | `SysTimeRtc`（系统时钟用） |

## 导入 POU

**逐个右键创建对应类型，然后把 `.iecst` 文件内容粘贴进去**：

| 文件                           | POU 类型                  |
| ------------------------------ | ------------------------- |
| `E_WsState.iecst`              | DUT → Enumeration         |
| `GVL_HmasChannels.iecst`       | GVL                       |
| `FB_Sha1.iecst`                | FB (POU)                  |
| `FB_Base64Encoder.iecst`       | FB (POU)                  |
| `FB_HmasFrameBuilder.iecst`    | FB (POU)                  |
| `FB_HmasWebSocketServer.iecst` | FB (POU)                  |
| `PLC_PRG.iecst`                | PRG（替换默认的 PLC_PRG） |

或者使用 **PLCopen XML 导入**（推荐高级用户）：把 ST 内容包装为 PLCopen XML 后通过 **Project → Export PLCopen XML / Import PLCopen XML**。

## 任务配置

Application → Task Configuration → MainTask：

- **Type**: Cyclic
- **Interval**: `T#10MS`
- **Priority**: 1
- **POUs**: `PLC_PRG`

## 编译 + 下载

1. **Build → Build (F11)** — 应该 0 errors / 0 warnings
2. **Online → Login (Alt+F8)** — 下载到 runtime
3. **Debug → Start (F5)** — 运行

## 网络验证

在浏览器开发者工具 Console 测试：

```javascript
const ws = new WebSocket("ws://192.168.1.100:8765");
ws.onopen = () => console.log("connected");
ws.onmessage = (e) => console.log("frame:", e.data.slice(0, 100));
```

应该看到每 100 ms 一帧 `{"type":"frame","ts":...,"ch":{...}}`。

## 在 HMAS 仪表盘里使用

1. 打开 HMAS（默认 `http://localhost:5173/`）
2. 点击数据源切换器
3. 选择 **WebSocket**，URL 填 `ws://<PLC-IP>:8765`，**Connect**
4. 切到实时监测视图，应该看到通道波形开始更新

## 故障排查

| 错误                                 | 原因 / 修复                                       |
| ------------------------------------ | ------------------------------------------------- |
| `TCP_Server error: 5`                | 端口被占用，换一个或杀掉占用进程                  |
| 浏览器 `WebSocket connection failed` | PLC 防火墙；macOS / Linux 上 8765 可能被占        |
| 握手超时（3 秒）                     | 浏览器请求体过大（>2 KB），扩大 `abyRxBuf`        |
| 帧内容是 NaN                         | `xChannelsValid` 没置位，或 IO 模块未连接         |
| 仪表盘只显示部分通道                 | 检查 `FB_HmasFrameBuilder` 中是否所有通道都被写入 |
