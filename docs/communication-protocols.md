# 通信协议说明 · Communication Protocols

本文档描述 HMAS v2 支持的三种外部数据源接入方式：WebSerial（串口）、WebSocket 和 Modbus TCP（通过 Tauri 桌面壳）。

---

## 1. WebSerial — 串口直连

### 适用场景

浏览器通过 USB/RS-232 串口直接连接硬件 DAQ（STM32、Arduino、ESP32 等）。

**浏览器要求**：仅 Chromium 系（Chrome / Edge）支持 Web Serial API；Firefox、Safari 不支持。

### 连接参数

| 参数               | 默认值 | 可选值                                                           |
| ------------------ | ------ | ---------------------------------------------------------------- |
| 波特率 (Baud rate) | 115200 | 9600 / 19200 / 38400 / 57600 / 115200 / 230400 / 460800 / 921600 |
| 数据位             | 8      | —                                                                |
| 停止位             | 1      | —                                                                |
| 校验位             | None   | —                                                                |

### 帧格式

串口以 **换行符（`\n`）分隔**，每行一个 JSON 对象：

```
{"ts":1746835200000,"ch":{"CH01":287.4,"CH02":65.1,"CH03":42.0,...}}\n
```

| 字段 | 类型     | 说明                                   |
| ---- | -------- | -------------------------------------- |
| `ts` | `number` | Unix 时间戳，毫秒（`Date.now()` 精度） |
| `ch` | `object` | 通道 ID → 物理量值（工程单位，见下表） |

通道 ID 固定为 `CH01`–`CH08`、`F01`、`F02`、`V01`、`V02`、`S01`，不需要全部出现，缺省通道会被跳过。

### 示例（Arduino / STM32）

```c
// Arduino 示例 —— 每 100 ms 发送一帧
void loop() {
  Serial.print("{\"ts\":");
  Serial.print(millis() + epoch_offset);   // 需与 NTP 对齐，或由上位机注入
  Serial.print(",\"ch\":{");
  Serial.print("\"CH01\":"); Serial.print(readPressure1(), 2); Serial.print(",");
  Serial.print("\"CH02\":"); Serial.print(readTemp1(), 2);
  Serial.println("}}");
  delay(100);
}
```

### 错误处理

- 行内 JSON 解析失败时该行被丢弃，不影响后续帧。
- 串口断开后状态变为 `error`；需用户手动重连（Web Serial API 不支持自动重连）。

---

## 2. WebSocket — 网络实时流

### 适用场景

后端采集服务（Python / Node.js / Go）通过网络将数据推送至前端，或通过 WebSocket-Modbus 代理转发 PLC 数据。

**URL 格式**：`ws://host:port/path` 或 `wss://host:port/path`（TLS）

### 消息格式

服务端推送纯文本 JSON，支持两种结构：

#### 单帧模式

```json
{
  "type": "frame",
  "ts": 1746835200000,
  "ch": {
    "CH01": 287.4,
    "CH02": 65.1,
    "V02": 0.82
  }
}
```

#### 批次模式（推荐用于高采样率）

```json
{
  "type": "batch",
  "frames": [
    { "ts": 1746835200000, "ch": { "CH01": 287.4 } },
    { "ts": 1746835200010, "ch": { "CH01": 288.1 } }
  ]
}
```

> `type` 字段可省略——消息缺少 `type` 时按单帧解析。

| 字段     | 类型                   | 说明                 |
| -------- | ---------------------- | -------------------- |
| `type`   | `"frame"` \| `"batch"` | 消息类型（可选）     |
| `ts`     | `number`               | Unix 时间戳，毫秒    |
| `ch`     | `object`               | 通道 ID → 值         |
| `frames` | `array`                | batch 模式下的帧数组 |

### 推荐发送频率

| 场景         | 建议                                   |
| ------------ | -------------------------------------- |
| 实时波形显示 | 每帧 ≥ 10 Hz（100 ms 间隔）            |
| 高精度分析   | 可用 batch 模式合并发送，每批 ≤ 100 帧 |
| 低带宽环境   | 只发送有效通道，无需填充 null          |

### 自动重连策略

客户端实现了指数退避重连，最多重试 5 次：

| 重试次数 | 等待时间 |
| -------- | -------- |
| 1        | 1 s      |
| 2        | 2 s      |
| 3        | 4 s      |
| 4        | 8 s      |
| 5        | 16 s     |

超过 5 次后状态变为 `error`，需用户手动重连。

### 后端最小示例（Python）

```python
import asyncio, json, time
import websockets

async def handler(ws):
    while True:
        frame = {
            "type": "frame",
            "ts": int(time.time() * 1000),
            "ch": {
                "CH01": read_pressure_bar(),
                "V02": read_vibration_g(),
            },
        }
        await ws.send(json.dumps(frame))
        await asyncio.sleep(0.1)   # 10 Hz

async def main():
    async with websockets.serve(handler, "0.0.0.0", 8765):
        await asyncio.Future()

asyncio.run(main())
```

---

## 3. Modbus TCP — 工业总线（Tauri 桌面版）

### 适用场景

通过以太网连接支持 Modbus TCP 协议的 PLC、变频器、传感器变送器等工业设备。

**限制**：此功能**仅在 Tauri 桌面版**中可用，浏览器无法直接建立 TCP 连接。Rust 后端（`src-tauri/src/modbus.rs`）通过 Tauri 命令桥接给前端。

### 连接参数

| 参数     | 类型     | 说明                                  |
| -------- | -------- | ------------------------------------- |
| `host`   | `string` | 设备 IP 地址，如 `192.168.1.100`      |
| `port`   | `number` | 默认 `502`（Modbus TCP 标准端口）     |
| `unitId` | `number` | 从站地址，通常为 `1`（0xFF 表示广播） |

### 支持的 Modbus 功能码

| 功能码 | 名称                   | 前端 API                             |
| ------ | ---------------------- | ------------------------------------ |
| FC03   | Read Holding Registers | `modbus.readHolding(address, count)` |
| FC04   | Read Input Registers   | `modbus.readInput(address, count)`   |
| FC06   | Write Single Register  | `modbus.writeSingle(address, value)` |

### 寄存器映射（默认约定）

具体寄存器地址以实际设备手册为准，下表为推荐映射：

| 寄存器地址  | 通道      | 换算说明                            |
| ----------- | --------- | ----------------------------------- |
| 40001–40008 | CH01–CH08 | 原始值 ÷ 100 → 工程值（如压力 kPa） |
| 40009       | F01       | 原始值 ÷ 10 → L/min                 |
| 40010       | V01       | 原始值 → RPM（整数）                |
| 40011       | V02       | 原始值 ÷ 1000 → g（振动加速度）     |

> 浮点数通常需要两个连续寄存器（IEEE 754 Big-Endian），具体取决于设备实现。

### 调用示例（前端 TypeScript）

```typescript
import { modbus } from "@/io/modbus";

// 连接
await modbus.connect({ host: "192.168.1.100", port: 502, unitId: 1 });

// 读取保持寄存器 40001–40008（地址从 0 开始，对应 Modbus 地址 40001 → address=0）
const result = await modbus.readHolding(0, 8);
// result.registers → number[]，长度 8

// 写入单个寄存器
await modbus.writeSingle(9, 1500); // 设置 F01 目标流量 = 150.0 L/min

// 断开
await modbus.disconnect();
```

### Tauri 命令接口（Rust 侧）

| 命令名                | 参数                     | 返回                            |
| --------------------- | ------------------------ | ------------------------------- |
| `modbus_connect`      | `{ host, port, unitId }` | `()`                            |
| `modbus_disconnect`   | —                        | `()`                            |
| `modbus_read_holding` | `{ address, count }`     | `{ registers, address, count }` |
| `modbus_read_input`   | `{ address, count }`     | `{ registers, address, count }` |
| `modbus_write_single` | `{ address, value }`     | `()`                            |

---

## 通道 ID 与物理量对照

所有三种接入方式共用同一套通道 ID：

| 通道 ID   | 物理量                         | 单位      | 量程     |
| --------- | ------------------------------ | --------- | -------- |
| CH01–CH08 | 模拟量（压力 / 温度 / 位移等） | 配置决定  | 配置决定 |
| F01       | 主管路流量                     | L/min     | 0–500    |
| F02       | 油液颗粒度（ISO 4406）         | 粒子数/mL | —        |
| V01       | 电机转速                       | RPM       | 0–6000   |
| V02       | 电机振动（宽带加速度）         | g         | 0–50     |
| S01       | 声学声压级                     | dB SPL    | 0–140    |

---

## 数据流路径

```
硬件 / 服务端
    │
    │  串口帧 / WebSocket 消息 / Modbus 寄存器
    ▼
useWebSerial / useWebSocket / modbus.ts
    │
    │  SampleFrame { timestamp, channels: Map<id, value> }
    ▼
acquisitionStore.pushFrame()
    │
    │  TimeWindowBuffer（环形，10 kHz × 13 ch）
    ▼
FFT Worker → dsp store → 各图表组件
```
