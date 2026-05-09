# HMAS v2.0 后期规划

最后更新：2026-05-09 · 主分支 `claude/read-codebase-i4A4I`

---

## 现状盘点

### ✅ 已完成
- 实时监测视图（V1 工业级视觉密度）
  - 13 路通道（CH01–CH08 模拟量、F01/F02 流量颗粒度、V01/V02 转速振动、S01 声学）
  - 左侧采集参数 + 右侧 KPI / 告警 / 存储 / 事件日志
  - 顶部品牌 + 多项状态条 + 底部 SYS/CPU/GPU/FPS
- 频谱分析视图（FFT 主谱 + 360 列瀑布 + 1/3 倍频程 A/C 计权 + Top-8 峰值列表 + THD）
- 模拟器（10 kHz / 16-bit，13 通道物理耦合波形）
- 中英双语（vue-i18n + localStorage 持久化）
- 性能优化（每卡独立 FPS / 旋转因子缓存 / 响应式 60Hz 节流 / 倍频程 bin 缓存）
- 三大瀑布图跨 Tab 持久化
- 报警规则编辑器（增删改、严重度色标）
- 配置视图（通道使能/耦合/量程，导入导出 JSON）

### ⚠️ 半成品 / 断头
- **文件数据源**：UI 切换器有，但 CSV/WAV 加载流程未完整实装（无 worker、无拖拽 UI）
- **历史会话**：列表 + 筛选 UI 有，但**没有录制逻辑**，也没有回放控制
- **告警评估**：simulator 调用时传空 `{}`/`{}`，所以**RMS/Peak 类规则永远不会触发**
- **轴承诊断**：只有 `bearing.ts` 公式，无 UI 无包络解调
- **导出**：菜单按钮有，无实际 CSV/PNG 生成

---

## 规划路线

### P1 — 核心闭环 ✅ 已完成（2026-05-09）

| # | 任务 | 状态 |
|---|---|---|
| 1.1 | CSV 加载完整链路 | ✅ `csv-parser.worker.ts` + `useFileLoader` + `DataSourceSwitcher` 拖拽 |
| 1.2 | WAV 加载 | ✅ AudioContext 解码 + stride 重采样到 10 kHz |
| 1.3 | 文件回放控制 | ✅ `usePlayback` + `PlaybackControls.vue`（播/停/拖拽 seek/0.25–8× 速度）|
| 1.4 | 告警评估接通真实 RMS/Peak | ✅ `useSimulator` 250ms 刷新 1s 滚动指标，传给 `evaluateFrame` |
| 1.5 | 历史会话录制 | ✅ `sessionStore.beginSession/endSession`，App.vue 自动钩入开始/停止/切源 |
| 1.6 | 历史会话视图 | ✅ HistoryView 重写：源标签徽章 + 详情面板 6 项指标 + 通道列 + 删除/清空 |
| 1.7 | CSV 数据导出 | ✅ `useExport.exportCsv`（顶栏 ⤓ CSV 按钮）|
| 1.8 | PNG 截图 | ✅ `useExport.exportPng`（html-to-image，WebGL preserveDrawingBuffer 已开）|

**里程碑达成**：完整的"采集 → 分析 → 告警 → 导出 → 归档"闭环。可作为 **v2.1** 发版基线。

> 注：会话归档只存元数据（不存原始样本，因 localStorage 5 MB 上限）。
> 真实数据的"录-回放"走 CSV 导出 → 重新加载的路径。

---

### P2 — 高级信号分析 ✅ 已完成（2026-05-09）

| # | 任务 | 状态 |
|---|---|---|
| 2.1 | 包络解调 | ✅ FFT worker 加 `envelope:bool` 分支：Hilbert(信号) → \|·\| → 去 DC → FFT。SpectrumMain header 紫色"包络/Envelope"切换 |
| 2.2 | 轴承诊断面板 | ✅ `BearingDiagnosticPanel.vue`：6 种轴承预设 + 自定义几何 + BPFI/BPFO/BSF/FTF 实时频率与振幅 + 故障判别行；SpectrumMain 频谱叠加 4 色虚线标记 |
| 2.3 | 齿轮啮合频率 | ✅ 同一面板下方 GEAR 子区：齿数 Z 输入 → GMF + ±SB 紫色叠加 |
| 2.4 | 阶次跟踪（X 轴模式）| ✅ Hz / ORDER 切换按钮，X 轴标签从 100Hz/1k/5k 切到 1×/2×/4×/8×/16×… 游标读数同步 |
| 2.5 | 告警统计图 | ✅ AlarmsView 顶部新增 24h 直方图（Canvas2D，最热小时红色辉光）+ 严重度甜甜圈（中心总数）|
| 2.6 | 频谱游标 M1/M2 | ✅ 单击放 M1（琥珀），Shift-click 放 M2（紫）；状态栏显示 Δf / 1/Δf 周期 |
| 2.7 | LAeq 60s 趋势 | ✅ 声学卡 SPL 渐变条下方 220×36 px 黄色发光迷你折线（自动量程，1Hz 采样）|

**里程碑达成**：从"普通监控大屏"升级为**专业振动诊断工具**。可作为 **v2.5** 发版基线。

---

### P3 — 工程化（健壮性，0.5–1 周）

| # | 任务 |
|---|---|
| 3.1 | Vitest 单元测试覆盖 `dsp/`（FFT 黄金值对比、Goertzel、octave 计权、bearing 公式） |
| 3.2 | Playwright E2E 烟雾测试（启动 → 切 4 个 Tab → 截图比对） |
| 3.3 | ESLint + Prettier + lint-staged + husky pre-commit |
| 3.4 | GitHub Actions：lint + build + 上传 dist 到 Pages（用户已表示 Pages 需付费，可选） |
| 3.5 | Bundle 大小审计（vite-plugin-visualizer），目前估计 ~400 KB gzipped |
| 3.6 | 性能基准（@vue/devtools profile + 自动 FPS 监测） |

---

### P4 — 真实硬件接入（可选，按需求）

| # | 任务 | 备注 |
|---|---|---|
| 4.1 | **WebSerial 接入 STM32/Arduino DAQ** | 浏览器需 Chromium 内核，定义统一帧协议（preamble + ch_count + samples） |
| 4.2 | **WebSocket 流式数据** | 主线程接收 → 直接走 pushFrame |
| 4.3 | **Modbus / OPC UA**（通过本地 proxy） | Node 旁路服务转 WebSocket |
| 4.4 | **Tauri 桌面端打包** | 解锁文件系统权限 / TDMS 写入 / 串口直访 |

---

### P5 — 长期愿景

- AI 辅助诊断（轴承故障模式自动识别 / 异常时间段标注）
- 多设备协同（看板模式：N 台 DAQ 一屏总览）
- 云端会话同步（用户登录后跨设备访问历史）
- PDF 巡检报告自动生成

---

## 建议节奏

```
本周        P1.1–P1.4    文件加载 + 告警接通
下周        P1.5–P1.8    会话录制 + 回放 + 导出
第 3 周     P2.1–P2.3    包络 + 轴承 + 齿轮
第 4 周     P2.4–P2.7    阶次 + 告警统计 + 游标
第 5 周     P3           工程化 / 测试 / CI
后续        P4 / P5      按业务需求驱动
```

P1 完成即可作为 v2.1 发版，覆盖一个完整的"采集 → 分析 → 告警 → 导出"闭环；
P2 完成可作为 v2.5，对外能差异化于"普通监控大屏"成为真正的信号分析工具；
P3 完成可作为 v3.0 长期维护基线。

---

## 当前断头优先级排序（如果只能挑 3 件做）

1. **P1.4 告警接通**（半天，但用户立刻能看到红色告警事件流，体感价值高）
2. **P1.5 + P1.6 历史录制回放**（2 天，是从"演示版"到"工程版"的分水岭）
3. **P2.2 轴承诊断面板**（1 天，是"普通仪表盘"和"专业振动分析"的分水岭）

其他都是锦上添花。
