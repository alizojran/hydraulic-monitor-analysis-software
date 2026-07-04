# 液压监测分析系统 · HMAS v3.0

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

阿里云已部署 V2 分析软件：

```text
http://8.148.228.136:8080/hydraulic-monitor-analysis-software/
```

部署方式：`v2/dist` 静态文件由阿里云端 `hmas-cloud-server` 的 8080 HTTP 服务托管在 `/hydraulic-monitor-analysis-software/` 路径下。页面和云端 API / WebSocket 同源，默认云端地址会使用当前页面 origin。

---

## 本地数据库管理 · Local Cloud DB Admin

数据库管理页面运行在管理电脑本地，阿里云只提供受 Token 保护的管理 API，不再直接开放 `/admin` 页面。

本地启动管理页面：

```bash
cd hydraulic-monitor-analysis-software/local-admin
python3 serve_no_cache.py
```

打开：

```text
http://127.0.0.1:18080/
```

页面里的云服务器地址默认是：

```text
http://8.148.228.136:8080
```

管理 Token：

```text
d40712c1ee3df9692743f1ecb788274319128707392fb319
```

管理页可查看在线设备数量、模拟器状态、云端暂存数据、设备最新数据、只读 SQL 查询、按时间清理旧数据，并控制云端模拟器启动 / 停止。点击在线设备后，可以直接查看该设备的数据和压力、流量、转速、温度、油液颗粒度等过程量。

本地管理页刷新策略：

```text
设备过程量：0.5 秒刷新
在线设备 / 云端暂存统计 / 顶部状态：约 3 秒刷新
历史表格：不自动刷新，点击“查询”时读取
数据库占用空间：云端约 60 秒校准一次
```

云端暂存统计做了低 CPU 优化：`总记录数 / FFT 摘要 / 最新入库` 由云端入库时增量更新，管理页不会频繁执行 `count(*)`；`数据库占用空间` 仍由 PostgreSQL 周期计算，所以不会每次点击都立刻变化。

历史查询策略：

```text
未填写起止时间：按“最新条数(无时间)”查询最新 N 条
填写开始时间或结束时间：先统计该时间范围总行数，再每批 100 条分页下载
```

时间范围查询会显示接收进度，例如 `时间范围共 1234 条，正在接收：300 / 1234`。这种模式下不用手动估算要往回读多少条，`最新条数(无时间)` 只用于未填写时间范围的最新数据查询。

起止时间支持手动输入到秒，例如：

```text
2026/06/28 00:50:00
2026-06-28 00:50:00
2026-06-28T00:50:00
```

查询完成后，管理页会使用当前查询结果绘制曲线：

```text
X 轴：时间
Y 轴：勾选的数值信号
支持单个信号或多个信号同时绘制
```

曲线只使用已经查询到浏览器里的数据，不会额外增加云端数据库查询压力。不同量纲的多条曲线会按各自最小/最大值缩放，方便同时查看压力、流量、转速、振动、噪声等趋势。

CODESYS 上传到云端的 FFT 已改为二进制 `int16` 格式：`dB * 10` 后发送，不需要在 CODESYS 里做 zlib。`fftSize=2048`、V02/S01 各 1 帧/秒时，单台控制器上传约 `35 kbps`。云端入库时再使用 zlib 压缩保存完整频谱。

数据职责划分：

```text
本地网页：只负责实时查看、历史查询、截图/CSV 手动导出，不承担长期本地存储
阿里云：接收 CODESYS 上传，实时 WebSocket 转发，PostgreSQL 暂存 3~7 天
公司数据服务器：每天主动从阿里云拉取数据，校验后导入 RAID 长期数据库
```

### 40 台设备服务器规划

按阿里云公网带宽 `3 Mbps`、单台设备公网占用约 `40 ~ 45 kbps` 估算：

```text
理论上限：约 60 台
稳妥规划：40 台
```

40 台设备持续上传时：

```text
设备上传：约 80 帧 FFT/秒
数据库写入：约 160 行/秒
  - fft_summary 80 行/秒
  - fft_spectrum 80 行/秒
```

服务器配置建议：

```text
最低能跑：2 vCPU / 2 GB
比较稳妥：2 vCPU / 4 GB
长期稳定：4 vCPU / 8 GB
```

40 台设备建议先按 `2 vCPU / 4 GB` 规划。当前 2 vCPU / 2 GB 服务器单设备模拟器运行时，Node 约 `68 MB`，PostgreSQL 后端约 `86 MB`，可用内存约 `1.2 GB`，但 40 台长期运行建议留出更多内存给 PostgreSQL 和系统缓存。

磁盘按压缩后数据估算：

```text
单台设备：约 0.4 ~ 0.5 GB/天
40 台设备：约 16 ~ 20 GB/天
保留 7 天：约 140 GB，建议磁盘 >= 200 GB
保留 30 天：约 540 GB，建议磁盘 >= 600 GB
```

当前 40 GB 系统盘只适合测试，40 台设备约只能保存 `1.5 ~ 2 天` 数据。生产环境建议配置自动清理策略，例如保留最近 7 天。

### 公司服务器备份方案

公司数据服务器没有公网 IP 时，推荐采用“公司服务器主动拉取”的方式：

```text
CODESYS 控制器
  -> 阿里云 TCP Server
  -> 阿里云 PostgreSQL 暂存 3~7 天
  <- 公司数据服务器每天凌晨主动 SSH/HTTPS 拉取
  -> 公司 PostgreSQL/TimescaleDB + RAID 长期保存
```

建议流程：

```text
1. 公司服务器定时任务每天凌晨启动
2. SSH 登录阿里云，只开放阿里云 SSH，不暴露 PostgreSQL 5432
3. 阿里云导出前一天 00:00:00 ~ 23:59:59 数据
4. 生成 manifest.json 和 sha256 校验
5. 公司服务器下载压缩数据包
6. 校验成功后导入公司长期数据库
7. 阿里云保留最近 7 天，只清理 7 天前数据
```

带宽和计费建议：

```text
40 台设备每天约 16 ~ 20 GB 数据
0.8 元/GB + 100 Mbps：约 384 ~ 480 元/月，夜间同步约 30 ~ 60 分钟
10 Mbps 包月 538.86 元/月：夜间同步约 4.5 ~ 6 小时
临界点：538.86 / 0.8 ≈ 674 GB/月
```

当前 40 台预计 `480 ~ 600 GB/月`，建议优先选 `0.8 元/GB + 100 Mbps`，后续实际超过 `700 GB/月` 再考虑固定带宽包月。

公司数据服务器建议：

```text
CPU：4 ~ 8 核
内存：16 ~ 32 GB
数据库：PostgreSQL + TimescaleDB 或按天分区
数据盘：RAID6 偏容量和安全，RAID10 偏性能
容量：40 台约 6 ~ 8 TB/年，建议按 8 ~ 10 TB/年规划
```

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
│   ├── dsp.ts           聚合 facade（v3 拆分后保留向下兼容）
│   ├── dspCompute.ts    FFT worker 编排 · fftConfig · 通道选择
│   ├── bearingModel.ts  bearings[] 几何 · allBearingFreqs · GMF
│   ├── spectrumHistory.ts  瀑布列历史（运行时数据）
│   ├── alarms.ts        规则 + 事件 · evaluateFrame · 版本化 localStorage
│   ├── config.ts        通道配置 · 采集参数 · 版本化 localStorage
│   ├── profiles.ts      ProfileSnapshot CRUD · capture/apply · JSON 导入导出
│   └── session.ts       历史会话元数据
├── utils/
│   └── persistedStore.ts  通用 localStorage 版本化 + 迁移框架
├── types/
│   ├── validators.ts    边界 schema 校验（WebSocket / WebSerial / 持久化）
│   └── tauri.d.ts       Tauri API 可选导入类型桩
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
│   ├── useAnimationLoop.ts  共享 rAF + shouldDraw FPS 控制
│   ├── useLocaleName.ts  数据驱动双语字段（nameZh/nameEn）统一访问
│   └── useLang.ts        脚本/Canvas 内文本本地化助手
└── components/
    ├── layout/          AppHeader · AppStatusBar
    ├── common/          GlowCanvas · DataSourceSwitcher · PlaybackControls
    ├── realtime/        AnalogChannelCard · FlowCard · ParticleCard
    │                    RpmCard · VibrationCard · AcousticCard · KpiPanel
    ├── spectrum/        SpectrumMain · SpectrumControls · SpectrumOverlays
    │                    WaterfallChart · OctaveBandChart · PeakList
    │                    BearingDiagnosticPanel · BearingParamEditor
    │                    FaultAnalysisPanel · FaultSummaryPanel
    ├── alarms/          AlarmRuleEditor · AlarmEventLog
    │                    AlarmTimeline · AlarmStatsChart
    ├── config/          ProfileSwitcher · ChannelConfigSection
    │                    AcquisitionConfigSection · SpectrumConfigSection
    │                    DiagnosticsConfigSection · SystemConfigSection
    │                    AboutSection · AlarmRulesInline
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
- **P5** GitHub Actions CI（lint + format:check + type-check + test + build）
- **M2** localStorage 版本化框架 + 迁移链（5 个 store 接入）
- **M2** dsp store 拆分（dspCompute / bearingModel / spectrumHistory + facade）
- **M2** 4 个巨型组件拆分（AlarmsView / SpectrumMain / ConfigView / BearingDiagnosticPanel）
- **M2** TS strict（noUnusedLocals / noUnusedParameters / noImplicitOverride / noFallthroughCasesInSwitch）
- **M2** 消除主代码 `as any` / `!` 断言 · 边界 schema 校验（validators.ts）
- **M2** i18n 内联三元清理 + ESLint 中文字符串守卫规则

### ⏳ 规划中

| 里程碑 | 任务 |
|---|---|
| M1 | 性能基础（环形缓冲 / WebGL 复用 / 路由分包）|
| M3 | 测试与稳健（关键路径 80% / 网络 jitter / 错误 UI）|
| M4 | 生产化（多客户端 CODESYS / Tauri 验证 / OPC-UA 接入）|
| —  | AI 辅助故障识别（LLM 集成，暂不计划）|

---

## License

MIT
