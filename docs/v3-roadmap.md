# HMAS v3.0 优化路线图 · v3.0 Optimization Roadmap

> 基于 v2.0 全代码库审计（2026-05-10）。共识别 **50+ 项可改进点**，按影响力 / 工作量分入 4 个里程碑。
> 主题：**性能 · 稳健 · 可维护 · 可部署**

---

## 📊 现状评估

| 维度     | 当前状态                | 主要痛点                                              |
| -------- | ----------------------- | ----------------------------------------------------- |
| 性能     | 🟡 OK，但有 GC 抖动     | 环形缓冲用 `shift/push`（O(n)），WebGL 每帧重传缓冲   |
| 架构     | 🟡 大致清晰，但有臃肿点 | 4 个 500+ 行组件，dsp store 承担 5 类职责             |
| 类型安全 | 🟢 较好                 | 少量 `as any`，部分 `!` 断言，事件 handler 不严格     |
| 测试覆盖 | 🔴 偏低                 | 36 条测试全在 dsp/，composables/stores/workers 零覆盖 |
| 文档     | 🟢 良好                 | DSP 算法注释完整；composables 缺 JSDoc                |
| i18n     | 🟢 同步                 | 个别组件有硬编码三元字符串                            |
| 部署     | 🟡 Tauri 已搭骨架       | 桌面端 Modbus 未端到端验证；无路由懒加载              |

---

## 🎯 M1 — 性能基础（1–2 周）

> **目标**：消除每帧 GC 抖动；首屏 JS bundle ≤ 100 KB（gzip）；FFT 持续 30 fps 稳定。

### 1.1 环形缓冲重写

| 文件                                   | 当前问题                                  | 改造方案                               |
| -------------------------------------- | ----------------------------------------- | -------------------------------------- |
| `v2/src/stores/acquisition.ts:42-47`   | `frames.shift(); frames.push()` 每帧 O(n) | 预分配 `Float32Array` + 写指针环形索引 |
| `v2/src/stores/acquisition.ts:125-126` | 声学瀑布同样 shift/push                   | 同上，复用 SpectrumHistoryRing 实现    |
| `v2/src/stores/dsp.ts:268-272`         | 频谱列扩展 `[...arr, col]`                | 固定列数 ring，`writeIdx % cols`       |

**收益**：13 通道 × 10 kHz 持续运行 5 分钟，主线程 GC 暂停从 ~80 ms/min 降到 < 5 ms/min。

### 1.2 WebGL 渲染优化

| 文件                                  | 改造点                                                    |
| ------------------------------------- | --------------------------------------------------------- |
| `v2/src/gl/GLPlot.ts:130-131,183`     | `bufferData(DYNAMIC_DRAW)` → 预分配后用 `bufferSubData`   |
| `v2/src/gl/GLPlot.ts:93-94`           | `Math.min(...Array.from(buf))` 改为入队时增量更新 min/max |
| `v2/src/gl/GLBars.ts`, `GLHeatmap.ts` | 同样的 buffer 复用策略                                    |

**收益**：GPU 上传带宽下降 ~70%；30 fps 下 CPU 占用 -15%。

### 1.3 Bundle 路由分割

```typescript
// v2/src/main.ts
const RealtimeView = () => import("@/components/views/RealtimeView.vue");
const SpectrumView = () => import("@/components/views/SpectrumView.vue");
const HistoryView = () => import("@/components/views/HistoryView.vue");
const AlarmsView = () => import("@/components/views/AlarmsView.vue");
const ConfigView = () => import("@/components/views/ConfigView.vue");
```

修改 `vite.config.ts`：

```typescript
build: {
  rollupOptions: {
    output: {
      manualChunks: {
        'vendor-vue': ['vue', 'vue-i18n', 'pinia'],
        'vendor-export': ['html-to-image'],
        'gl': ['./src/gl/index.ts'],
        'dsp': ['./src/dsp/index.ts'],
      }
    }
  }
}
```

**收益**：首屏 JS 从 220 KB → ~85 KB（gzip：72 → 28 KB）。

### 1.4 模拟器对象池

`v2/src/composables/useSimulator.ts:127` — 每采样 `new Map()`，10 kHz × 13 ch = 13 万次/秒分配。

**改造**：维持单一 `Map<string, number>` 实例，仅 `set()` 更新值；或换成 `Float32Array` + 通道索引表。

---

## 🏗️ M2 — 架构与类型（2–3 周）

> **目标**：单文件 < 350 行；store 职责单一；零 `any` 断言；localStorage 可迁移。

### 2.1 拆分巨型组件

| 文件                         | 行数 | 拆分方案                                                                                       |
| ---------------------------- | ---- | ---------------------------------------------------------------------------------------------- |
| `AlarmsView.vue`             | 608  | → `AlarmRuleEditor` + `AlarmEventLog` + `AlarmTimeline` + `AlarmStatsChart`                    |
| `SpectrumMain.vue`           | 515  | → `SpectrumControls`（窗函数/FFT 大小/平均）+ `SpectrumOverlays`（轴承/齿轮线）+ 主图          |
| `ConfigView.vue`             | 483  | → `ConfigLayout` + `ChannelConfigSection` + `DiagnosticsConfigSection` + `SystemConfigSection` |
| `BearingDiagnosticPanel.vue` | 478  | → `BearingParamEditor` + `FaultAnalysisPanel`                                                  |

### 2.2 拆分 dsp store

```
dsp.ts (当前 5 职责)
   ├─ FFT worker 编排           → stores/dspCompute.ts
   ├─ bearings[] 几何参数       → stores/bearingModel.ts
   ├─ allBearingFreqs           → 派生 computed，不持久化
   ├─ 频谱列历史（瀑布数据）    → stores/spectrumHistory.ts
   └─ localStorage 持久化       → utils/persistedStore.ts（通用工厂）
```

### 2.3 localStorage 模式版本化

每个持久化 key 加版本头：

```typescript
// utils/persistedStore.ts
interface PersistedRecord<T> {
  _version: number;
  _migratedAt?: number;
  data: T;
}

const MIGRATIONS: Record<string, ((d: unknown) => unknown)[]> = {
  "hmas-dsp": [migrateDspV1ToV2, migrateDspV2ToV3],
};
```

**修改**：`stores/dsp.ts`、`alarms.ts`、`config.ts`、`profiles.ts`、`session.ts` 全部接入。

### 2.4 类型安全收紧

| 文件                         | 当前                                | 改造                                              |
| ---------------------------- | ----------------------------------- | ------------------------------------------------- |
| `useWebSerial.ts:89`         | `port.readable!`                    | 加 runtime guard：`if (!port.readable) throw ...` |
| `useWebSocket.ts:39`         | `obj.ch as Record<string, unknown>` | 引入 zod / valibot schema 校验                    |
| `DataSourceSwitcher.vue:195` | `as any` Tauri import               | 写本地 `types/tauri.d.ts` 类型桩                  |
| `tsconfig.app.json:9-10`     | `noUnusedLocals: false`             | 改为 `true`，清理后开启                           |
| `AlarmsView.vue` 多处        | `ruleForm as any`                   | 定义严格 `AlarmRuleDraft` 类型                    |

---

## 🛡️ M3 — 稳健性与测试（2 周）

> **目标**：测试覆盖率 ≥ 60%；网络层有 jitter / timeout；用户能感知错误。

### 3.1 测试覆盖

| 模块                 | 优先级 | 测试要点                                       |
| -------------------- | ------ | ---------------------------------------------- |
| `useSimulator`       | 高     | 信号生成确定性、metrics RMS/Peak 正确性        |
| `useWebSocket`       | 高     | 重连退避、frame/batch 解析、超时               |
| `useWebSerial`       | 高     | 跨 chunk 行解析、不完整 JSON 容错              |
| `useAnimationLoop`   | 中     | 节流、shouldDraw、多订阅者                     |
| `fft.worker`         | 高     | 单元正弦波 → 单一 bin、Hilbert envelope 正确性 |
| `gl/GLPlot`          | 中     | 用 `vitest-canvas-mock`，验证 buffer 上传次数  |
| `stores/acquisition` | 高     | ring buffer 正确性、setDataSource 状态切换     |
| `stores/alarms`      | 中     | evaluateFrame 触发逻辑                         |

目标：**Vitest 测试数 36 → 100+；行覆盖率 ≥ 60%**

### 3.2 网络层加固

#### WebSocket（`useWebSocket.ts`）

```typescript
// 加 jitter 防雪崩
const jitter = 0.2 * Math.random() * delay;
setTimeout(() => openSocket(url.value), delay + jitter);

// 加连接超时
const connectTimer = setTimeout(() => {
  if (status.value === "connecting") {
    ws?.close();
    errorMsg.value = "Connection timeout (10s)";
  }
}, 10_000);
```

#### WebSerial（`useWebSerial.ts:38-50`）

行缓冲跨 chunk 边界问题——当前实现 OK 但需补测试，并增加：

- 最大行长度限制（防恶意单行 >1MB 导致 OOM）
- 心跳超时检测（30 s 无帧 → 主动重连）

### 3.3 错误反馈 UI

| 场景                  | 当前                         | 改造                               |
| --------------------- | ---------------------------- | ---------------------------------- |
| localStorage quota 满 | 静默失败（`dsp.ts:224-226`） | Toast 提示 + 旧 session 清理引导   |
| WebSocket 断开        | 仅状态字段                   | 顶栏红色横幅 + 重试倒计时          |
| Worker crash          | 无处理                       | 重启 worker + 错误上报             |
| WebGL context lost    | 无处理                       | 监听 `webglcontextlost` + 自动重建 |

---

## 🚀 M4 — 生产化与生态（1–2 周）

> **目标**：Tauri 桌面端可发布；CI 完整；扩展能力（多客户端 / 报表）就绪。

### 4.1 Tauri 桌面端验证

- [ ] `cargo tauri build` 在 Win / macOS / Linux 三平台通过
- [ ] Modbus 真实设备测试（找一台 PLC 或用 [diagslave] 模拟）
- [ ] 自动更新通道（GitHub Releases + tauri-plugin-updater）
- [ ] 离线安装包打包（含 Vite dist + Rust 二进制）

### 4.2 CI/CD 完善

| 任务                  | 工具                                           |
| --------------------- | ---------------------------------------------- |
| 单元测试 + 覆盖率门槛 | Vitest + Codecov（≥ 60%）                      |
| E2E 测试              | Playwright（关键用户路径：连接 / 切换 / 导出） |
| 视觉回归              | `@playwright/test` snapshot                    |
| Tauri 多平台构建      | `tauri-action`                                 |
| 自动发布              | semantic-release                               |

### 4.3 报表 / 报警增强

| 文件                 | 增强点                                          |
| -------------------- | ----------------------------------------------- |
| `useReport.ts`       | 进度条 / 取消；批量 PDF；报告对比模式（A vs B） |
| `useReport.ts`       | 模板可定制（公司 logo / 抬头 / 签名栏）         |
| `alarms` 视图        | 邮件 / Webhook / Telegram 通知；规则导入导出    |
| 新增 `historyExport` | 历史会话支持导出为 MAT / NPY 给科研用           |

### 4.4 多客户端 WebSocket / Modbus

当前 `FB_HmasWebSocketServer` 只接 1 个客户端。改造：

- `ARRAY[0..7] OF NBS.TCP_Connection`
- 每个连接独立握手 + 帧发送
- 支持监控端 + 操作端 + 巡检 PAD 同时连接

### 4.5 i18n 收敛

| 文件                         | 改造                                                              |
| ---------------------------- | ----------------------------------------------------------------- |
| `FaultSummaryPanel.vue:4-11` | `locale === 'zh' ? '故障诊断' : 'FAULT DIAGNOSIS'` → 移到 locales |
| 全局扫描                     | grep `locale.value === 'zh'` 找出所有内联三元                     |
| 加 lint rule                 | 自定义 ESLint rule 禁止组件内出现中文字符串字面量                 |

### 4.6 文档完善

- [ ] `docs/architecture.md` — 数据流图（已有 README 雏形，扩展）
- [ ] `docs/dsp-internals.md` — FFT / Hilbert / 1/3 倍频程算法白皮书
- [ ] `docs/contributing.md` — 开发规范、提交 / PR 流程
- [ ] 所有公开 composable 加 JSDoc（`useSimulator`, `useAnimationLoop` 等）

---

## 📅 时间线建议

```
              M1 性能       M2 架构        M3 测试       M4 生产
              ━━━━━━        ━━━━━━━━━━     ━━━━━━━       ━━━━━━━
Week  1  2    3  4  5  6   7  8  9  10  11 12     13 14 15
              ━━━━━━━━     ━━━━━━━━━━━    ━━━━━━━━       ━━━━━━━━━━
                            ▲ M2.3 schema
                              version 是后续基础，必须先做
                                                   ▲ M4.1 Tauri 阻塞
                                                     发布动作

总计：约 8–11 周（单人全职）/ 4–6 周（双人配合）
```

---

## 🎁 长期愿景（v3.x 之后）

| 版本     | 主题                                                          |
| -------- | ------------------------------------------------------------- |
| **v3.1** | OPC UA 客户端（西门子 / 罗克韦尔 PLC 接入）                   |
| **v3.2** | 多机协同：网关聚合多台 PLC 数据，统一展示                     |
| **v3.3** | AI 故障识别：本地 ONNX 模型 + 振动 / 声学多模态融合           |
| **v3.4** | Web SDK：把 DSP / GL 渲染抽成可独立使用的 npm 包              |
| **v4.0** | 时序数据库（InfluxDB / TDengine）后端 + 历史查询 + 多用户权限 |

---

## ✅ 决策点（需用户确认）

1. **优先级排序**：M1 性能优先，还是先做 M2 架构（影响后续所有迭代）？
2. **Tauri vs 纯 Web**：是否把 Tauri 升级为一等公民（影响 M4 投入）？
3. **测试目标**：60% 覆盖率是否合适？关键路径（DSP、网络）是否要 80%+？
4. **多客户端**：是否真的需要？大多数工业场景 1–2 个客户端足够。
5. **AI 识别（v3.3）**：本地推理还是云端？数据隐私 vs 推理精度的取舍。
