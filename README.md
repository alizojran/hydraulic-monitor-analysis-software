# 液压监测分析系统 · HMAS v2.0

> Hydraulic Monitor & Analysis System — 13-channel real-time DAQ analysis platform  
> 10 kHz / 16-bit acquisition · FFT spectrum · bearing diagnostics · gear mesh analysis ·  
> envelope demodulation · 1/3-octave bands · waterfall spectrograms · named config profiles ·  
> bilingual UI (中文 / English) · 100% browser-side SPA

---

## 快速开始 · Quick Start

```bash
git clone https://github.com/pbdto/hydraulic-monitor-analysis-software.git
cd hydraulic-monitor-analysis-software/v2
npm install
npm run dev
```

打开 `http://localhost:5173/` 即可。

```bash
npm run build       # → v2/dist/
npm run preview     # 本地预览构建结果
```

`dist/` 是纯静态资源，可部署到任意静态服务器（Nginx / Vercel / Netlify / GitHub Pages）。

---

## 功能速览 · Feature Overview

### 实时监测 · Realtime

| 通道 | 功能 |
|---|---|
| CH01–CH08 | 8 路模拟量（压力/温度/位移）· 辉光波形 · MIN/MAX/RMS 实时统计 |
| F01 | 主管路流量 · 环形仪表盘 · 瞬时/均值/累计/脉动/K-factor |
| F02 | 油液颗粒度 · ISO 4406 三段码 · >4 / >6 / >14 μm 计数条 |
| V01 | 电机转速 · 半圆表盘 · 标称/偏差/加速度/运行时长 · 稳态/加速/减速判断 |
| V02 | 电机振动 · FFT 条形（25–5000 Hz）· RMS/Peak/主频/峰值因数 |
| S01 | 声学采集 · SPL 大字 + 渐变条 · PEAK/LAeq/L10/L90/带宽 · 实时频谱瀑布 · LAeq 60s 趋势 |

### 频谱分析 · Spectrum

- **主频谱**：线性 dB 显示，可选窗函数 / FFT 点数 / 平均次数 / 重叠率
- **360 列频谱瀑布图**，跨 Tab 切换不丢失
- **30 个 1/3 倍频程条形**（A / C / 无 计权，IEC 61672）
- **Top-8 峰值列表** + THD
- **M1 / M2 双游标**：单击/Shift+单击 → 显示 Δf、1/Δf 周期
- **包络解调**（Hilbert 变换 → |·| → FFT），专为滚动轴承故障设计
- **阶次跟踪**：X 轴一键切换 Hz / Order（倍频）

### 轴承与齿轮诊断 · Diagnostics

- **多轴承支持**（DE / NDE 或任意命名），每个轴承独立几何参数
- 6 种预设（SKF 6205/6206/6308/6310、NSK 6204、FAG 22320）+ Custom
- 实时计算 BPFI / BPFO / BSF / FTF，与当前 FFT 振幅对应，带故障判别
- **频谱叠加**：各轴承 4 色虚线标注，两套色系区分 DE / NDE
- **齿轮啮合频率**（GMF）+ 双侧带（±SB）紫色叠加

### 数据管理 · Data Management

- **CSV / WAV 文件加载**：拖拽 + 进度条 + 播放回放（0.25×–8× 速度 + Seek）
- **历史会话录制**：自动开始/结束，元数据持久化
- **历史视图**：按来源/时间筛选，6 项指标详情，通道列表
- **CSV 数据导出**，**PNG 截图**（保留 WebGL 内容）

### 告警管理 · Alarms

- 阈值规则（通道 · 指标 · 条件 · 阈值 · 严重度）增删改
- 实时事件流 + 确认 / 批量确认 / 清除已解除
- 近 24 h 事件直方图 + 严重度甜甜圈

### 系统配置 · Config（7 个 Tab）

| Tab | 内容 |
|---|---|
| 通道 | 13 路使能 / 耦合 / 量程 / 单位 / 滤波 |
| 采集 | 采样率 / 触发模式 / 触发电平 / 预后触发 |
| 频谱 | FFT 大小 / 窗函数 / 平均 / 重叠 / X 轴模式 / 包络默认 / 倍频程计权 |
| 诊断 | 多轴承几何 + 添加/删除轴承 · 齿轮齿数 |
| 告警 | 告警规则完整编辑器 |
| 系统 | 语言 / 默认时间窗 / localStorage 用量与清理 |
| 关于 | 版本 / 构建时间 / 技术栈 |

**配置 Profile 系统**：命名保存 / 切换 / 复制 / 删除 / JSON 导入导出，刷新不丢参数。

---

## 技术栈 · Tech Stack

| 层 | 选型 |
|---|---|
| Framework | Vue 3 + TypeScript + Vite |
| State | Pinia（stores: acquisition / dsp / alarms / config / profiles / session）|
| i18n | vue-i18n（zh / en，localStorage 持久化）|
| FFT | 自研 radix-2 Cooley-Tukey（旋转因子缓存），Web Worker 零拷贝 |
| 信号处理 | Hilbert 包络 · 1/3 倍频程 IEC 61672 · 轴承公式 · 阶次跟踪 |
| 渲染 | WebGL2（GLPlot / GLBars / GLHeatmap）+ Canvas2D |
| 持久化 | localStorage（通道配置 / DSP 参数 / 告警规则 / 会话 / Profile）|
| 导出 | html-to-image（PNG）· 原生 Blob（CSV / JSON）|

无运行时依赖于 fft.js / chart.js / d3 等重型库——所有 GL 渲染和 DSP 算法均手写。

---

## 项目结构 · Project Layout

```
v2/src/
├── App.vue
├── main.ts
├── locales/             zh.json / en.json
├── config/
│   ├── channels.ts      13 路通道定义（hex / min / max / unit / type）
│   └── defaults.ts      FFT / 告警默认值
├── stores/
│   ├── acquisition.ts   数据源 · 运行状态 · TimeWindowBuffer · 频谱历史
│   ├── dsp.ts           FFT worker 编排 · bearings[] · allBearingFreqs · 持久化
│   ├── alarms.ts        规则 + 事件 · evaluateFrame · localStorage
│   ├── config.ts        通道配置 · 采集参数 · localStorage
│   ├── profiles.ts      ProfileSnapshot CRUD · capture/apply · JSON 导入导出
│   └── session.ts       历史会话元数据
├── workers/
│   ├── fft.worker.ts    内联 radix-2 FFT，支持 envelope 分支
│   └── csv-parser.worker.ts
├── gl/                  GLPlot · GLBars · GLHeatmap + shaders / utils
├── dsp/                 window · metrics · octave · envelope · bearing · orderTracking
├── composables/
│   ├── useSimulator.ts  物理耦合波形 + 真实 RMS/Peak
│   ├── useAcousticSpectrogram.ts  App 级 Goertzel 64 bin，60 Hz
│   ├── usePlayback.ts   CSV/WAV 文件回放（速度 + Seek）
│   ├── useExport.ts     CSV 导出 / PNG 截图
│   └── useAnimationLoop.ts  共享 rAF + shouldDraw FPS 控制
└── components/
    ├── layout/          AppHeader · AppStatusBar
    ├── common/          GlowCanvas · DataSourceSwitcher · PlaybackControls
    ├── realtime/        AnalogChannelCard · FlowCard · ParticleCard
    │                    RpmCard · VibrationCard · AcousticCard · KpiPanel
    ├── spectrum/        SpectrumMain · WaterfallChart · OctaveBandChart
    │                    PeakList · BearingDiagnosticPanel
    ├── config/          ProfileSwitcher · SpectrumConfigSection
    │                    DiagnosticsConfigSection · SystemConfigSection
    │                    AlarmRulesInline
    └── views/           RealtimeView · SpectrumView · HistoryView
                         AlarmsView · ConfigView
```

---

## 性能特性 · Performance Notes

- **采样率 10 kHz / 16-bit**：模拟器分批生成，绕开 `setInterval` 1 ms 下限
- **响应式节流**：1 kHz 写入 13 路 → reactive 镜像 60 Hz 刷新（避免 1.3 万次/秒触发响应链）
- **每卡独立 FPS**：CH01–CH08 5 fps · F02 1 fps · V02 / S01 / 频谱页 60 fps
- **三角函数表预计算**：FFT 旋转因子按 fftSize 缓存；Goertzel 扫频用预制 cos/sin 矩阵
- **倍频程边界缓存**：O(30 × ~50) 扫描，不扫全谱
- **WebGL context 上限感知**：所有视图 `v-if` 切换，避免超过浏览器 ~16 个 context
- **瀑布图跨 Tab 持久化**：声学 / 频谱列存 Pinia store，带单调 total 计数器解决环形覆盖检测

---

## 数据源 · Data Sources

| 来源 | 说明 |
|---|---|
| 模拟演示 | 物理耦合合成波形（泵脉动 / 工频谐波 / 转速耦合振动 / 声学宽带噪声） |
| CSV 文件 | 拖拽加载，Worker 自动检测时间戳列 + 分隔符，分块解析 + 进度条 |
| WAV 文件 | `AudioContext.decodeAudioData` 解码 → 映射声学通道，回放控制 |

---

## 浏览器要求 · Browser Requirements

| 必需 | 推荐 |
|---|---|
| WebGL2 | Chrome 120+ / Safari 17+ / Firefox 121+ |
| ES2022 Modules + Web Worker | 桌面端（macOS / Windows / Linux）|

不支持 IE；移动端可运行但 13 个 GL Canvas 性能有限。

---

## 路线图 · Roadmap

### ✅ 已完成

- 实时监测（13 通道全功能卡片）
- 真实 FFT pipeline + 频谱分析视图（瀑布 / 倍频程 / 游标 / THD）
- 包络解调 + 阶次跟踪
- 轴承诊断（多轴承 · 预设 + 自定义几何 · BPFI/BPFO/BSF/FTF 频谱叠加）
- 齿轮啮合频率（GMF + ±SB 叠加）
- CSV / WAV 文件加载 + 回放控制（速度 / Seek）
- 历史会话录制 + 浏览
- CSV 数据导出 + PNG 截图
- 阈值告警规则 + 事件流 + 统计图表
- 7-Tab 配置页（频谱 / 诊断 / 告警 / 系统 / 关于）
- 命名 Profile 系统（保存 / 切换 / 克隆 / 导入导出）
- 中英双语
- **P3** Vitest 单元测试 30 条（FFT / 轴承公式 / 倍频程 / 包络）
- **P3** ESLint 9 (flat config) + Prettier + husky pre-commit + lint-staged
- **P4** WebSerial composable（STM32 / Arduino 硬件 DAQ）
- **P4** WebSocket composable（实时流 / Modbus 代理）
- **P5** 规则引擎故障分类器（faultClassifier — 轴承 BPFI/BPFO/BSF/FTF 自动诊断）
- **P5** PDF 巡检报告生成（useReport + html-to-image）
- **P5** FaultSummaryPanel 故障摘要面板

### ⏳ 规划中

| 优先级 | 任务 |
|---|---|
| P4 | Tauri 桌面壳 + Rust Modbus 代理（离线部署）|
| P5 | GitHub Actions CI（test + lint + build）|
| P6 | AI 辅助故障识别（LLM 集成）|
| P6 | OPC-UA 接入 |

---

## License

MIT
