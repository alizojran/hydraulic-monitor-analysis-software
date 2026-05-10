# CODESYS WebSocket 服务器 — HMAS 数据源实现

> 用 CODESYS V3.5 / IEC 61131-3 ST 实现的 WebSocket 服务器，  
> 把 PLC 采集到的传感器数据按 [HMAS WebSocket 协议](../docs/communication-protocols.md) 推送到浏览器仪表盘。

## 架构

```
┌────────────────────┐         WebSocket           ┌─────────────────────┐
│  CODESYS PLC       │  ws://192.168.1.100:8765    │  HMAS Dashboard     │
│  (Server)          │ ◀──────────────────────────▶│  (Browser Client)   │
│                    │                              │                     │
│  PLC_PRG           │   ── HTTP Upgrade ──▶        │                     │
│   ├ 采集逻辑       │   ◀── 101 Switching ──       │                     │
│   ├ FrameBuilder   │                              │                     │
│   └ WebSocketSrv   │   ── Text Frame ──▶          │                     │
│                    │   ── JSON {ts, ch} ──▶       │                     │
└────────────────────┘                              └─────────────────────┘
```

PLC 监听 TCP 端口（默认 8765），接受一个浏览器客户端：

1. 完成 WebSocket HTTP Upgrade 握手（生成 `Sec-WebSocket-Accept`）
2. 周期性读取通道值（CH01–CH08 / F01 / F02 / V01 / V02 / S01）
3. 构造 JSON 帧 `{"type":"frame","ts":...,"ch":{...}}`
4. 包装成 WebSocket 文本帧（FIN=1, opcode=0x1, 服务端→客户端不掩码）
5. 通过 TCP 发送

浏览器仪表盘的 `useWebSocket` composable 会自动解析 `frame` / `batch` 两种格式。

## 文件结构

```
codesys/
├── README.md                              ← 本文档
├── PROJECT_NOTES.md                       ← CODESYS 工程导入步骤
└── POUs/
    ├── PLC_PRG.iecst                      ← 主程序（周期任务）
    ├── GVL_HmasChannels.iecst             ← 13 路通道值（全局变量）
    ├── E_WsState.iecst                    ← 状态机枚举
    ├── FB_HmasWebSocketServer.iecst       ← WebSocket 服务器主 FB
    ├── FB_HmasFrameBuilder.iecst          ← JSON 帧构造器
    ├── FB_Sha1.iecst                      ← SHA-1 哈希（握手用）
    └── FB_Base64Encoder.iecst             ← Base64 编码（握手用）
```

## 依赖库

| 库                        | 来源                  | 用途                                                                                     |
| ------------------------- | --------------------- | ---------------------------------------------------------------------------------------- |
| **CAA Net Base Services** | CODESYS Store（免费） | `NBS.TCP_Server`, `NBS.TCP_Connection`, `NBS.TCP_Read`, `NBS.TCP_Write`, `NBS.TCP_Close` |
| **Standard**              | 内置                  | 基础数据类型                                                                             |
| **Standard64**            | 内置                  | `ULINT` 64-bit 运算                                                                      |

> 如果你的 CODESYS 安装已带 `CmpCrypto`（含 SHA-1），可以删掉 `FB_Sha1` 直接调用 `HASH_SHA1`，本仓库自带的 SHA-1 实现是为了**零依赖**。

## 快速开始

### 1. 创建 CODESYS 工程

1. 新建 Standard project，选择目标设备（CODESYS Control Win V3 / Linux SL / 任意支持 NBS 的设备）
2. **Library Manager** → 添加 `CAA Net Base Services`
3. 把 `POUs/` 目录下的所有文件按文件名导入对应 POU（POU / GVL / DUT）
4. 任务配置：把 `PLC_PRG` 加到一个周期任务（建议 **10 ms** 周期，优先级 1）

### 2. 配置参数

打开 `PLC_PRG.iecst`，修改：

```structuredtext
fbServer(
    xEnable     := TRUE,
    udiPort     := 8765,         // 监听端口
    sLocalAddr  := '0.0.0.0',    // 0.0.0.0 = 所有网卡
    udiSendIntervalMs := 100     // 100 ms = 10 Hz
);
```

### 3. 接入实际传感器

`GVL_HmasChannels` 里的变量是浮点数。把它们映射到你的 IO：

```structuredtext
VAR_GLOBAL
    rCH01 AT %ID0  : REAL;   // 直接连接到 IB-IL AI 4 模块
    rCH02 AT %ID1  : REAL;
    // ...
    rV01           : REAL := 1450.0;   // 或在程序里赋值
END_VAR
```

### 4. 在 HMAS 中连接

打开 HMAS 仪表盘，在数据源切换器里：

- **Data Source**: `WebSocket`
- **URL**: `ws://<PLC-IP>:8765`
- 点击 **Connect**

正常情况下浏览器开发者工具的 Network 面板会看到 `101 Switching Protocols`，然后 Frames 面板里能看到 JSON 数据持续流入。

## 调试

| 现象                                   | 检查项                                                                   |
| -------------------------------------- | ------------------------------------------------------------------------ |
| 浏览器报 `WebSocket connection failed` | PLC 防火墙 / TCP 端口是否开放；`fbServer.xClientConnected` 是否短暂 TRUE |
| 握手成功但收不到帧                     | `nFramesSent` 是否在递增；`sLastError` 文本                              |
| 收到乱码或断开                         | 单帧 payload 是否超过 65535 字节（本实现单帧上限）                       |
| 中文 / 特殊字符乱码                    | `FB_HmasFrameBuilder` 输出必须是 UTF-8（数字字段不涉及）                 |

## 性能

| 指标             | 实测（i5 / Win Soft PLC） |
| ---------------- | ------------------------- |
| 握手耗时         | < 5 ms                    |
| 单帧构造 + 发送  | ~ 0.3 ms                  |
| CPU 占用 (10 Hz) | < 0.5 %                   |
| 最大稳定速率     | 100 Hz / 单客户端         |

## 限制

- 仅支持单客户端（适合本地工程师终端调试）。多客户端需扩展为 `ARRAY OF NBS.TCP_Connection`
- 不实现 ping/pong 心跳（TCP keepalive 由 OS 处理）
- 仅支持文本帧（opcode 0x1），未实现二进制 / 分片 / Close 帧的应答
- WebSocket Secure (`wss://`) 需要 TLS，CODESYS 端可由前置 nginx / haproxy 代理实现
