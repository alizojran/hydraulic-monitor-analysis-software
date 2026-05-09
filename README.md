# 液压监测分析系统 · HMAS v2.0

> Hydraulic Monitor & Analysis System — 13-channel real-time DAQ analysis dashboard
> with simulated 10 kHz / 16-bit acquisition, FFT spectrum, 1/3-octave bands,
> waterfall spectrograms, bilingual UI (中文 / English), and persistent alarms.

100% browser-side SPA — no backend, no database. Runs from a static-file host or
locally via Vite.

---

## 快速开始 · Quick Start

```bash
git clone https://github.com/pbdto/hydraulic-monitor-analysis-software.git
cd hydraulic-monitor-analysis-software/v2
npm install
npm run dev
```

打开 `http://localhost:5173/` 即可。

构建生产版本：

```bash
npm run build       # → v2/dist/
npm run preview     # 本地预览构建结果
```

`dist/` 是纯静态资源，扔到任何静态服务器都能跑（Nginx / Vercel / Netlify / GitHub Pages）。

---

## 功能速览 · Feature Overview

### 实时监测
- **8 路模拟量通道**（CH01–CH08）：压力 / 温度 / 油缸位移，带辉光波形 + MIN/MAX/RMS 实时统计
- **F01 主管路流量**：环形仪表盘 + 瞬时 / 均值 / 累计 / 脉动 / K-factor 五项指标
- **F02 油液颗粒度**：ISO 4406 三段码 + 清洁度状态徽章 + >4 / >6 / >14 μm 计数条
- **V01 电机转速**：半圆表盘 + 标称 / 偏差 / 加速度 / 运行时长 + 状态（稳态/加速/减速）
- **V02 电机振动 Y**：64 bin 对数频率 FFT 条形（25–5000 Hz）+ RMS / Peak / 主频 / 峰值因数
- **S01 声学采集**：73.0 dB(A) 大字 + SPL 渐变条 + PEAK / LAeq / L10 / L90 / 主频 / 带宽 + 实时频谱瀑布

### 频谱分析
- 主频谱（线性 dB，可选窗函数 / FFT 大小 / 平均次数）
- 360 列频谱瀑布图
- 30 个 1/3 倍频程条形（A / C / 无 计权）
- Top 8 峰值列表 + THD

### 历史 / 报警 / 配置
- 历史会话浏览 + 多轨回放
- 阈值告警规则（增删改）+ 触发事件流 + 严重度色标
- 13 通道配置、采集参数、触发设置

### 全局
- 中英双语切换（vue-i18n + localStorage）
- 颗粒级 FPS 控制：每张卡按数据动态选 1 / 5 / 60 fps
- WebGL2 渲染，回退到 Canvas 2D
- 三大瀑布图持久化跨 Tab 切换

---

## 技术栈 · Tech Stack

| 层 | 选型 |
|---|---|
| Framework | Vue 3 + TypeScript + Vite |
| State | Pinia（5 个 store：acquisition / dsp / alarms / config / session / ui）|
| i18n | vue-i18n |
| FFT | 自研 radix-2 Cooley-Tukey（带旋转因子缓存），运行在 Web Worker |
| 渲染 | WebGL2（GLPlot / GLBars / GLHeatmap）|
| 持久化 | localStorage（配置 / 告警规则 / 语言）|

无运行时依赖于 fft.js / chart.js / d3 等任何重型可视化库 —— 所有 GL 渲染层手写。

---

## 项目结构 · Project Layout

```
v2/src/
├── App.vue                       # 顶层布局 + 全局组合式
├── main.ts                       # createApp + Pinia + i18n
├── locales/                      # zh.json / en.json
├── config/
│   ├── channels.ts               # 13 路通道定义
│   └── defaults.ts               # FFT / 告警默认配置
├── stores/                       # acquisition / dsp / alarms / config / session / ui
├── workers/
│   └── fft.worker.ts             # 内联 radix-2 FFT，零外部依赖
├── gl/                           # GLPlot · GLBars · GLHeatmap + utils
├── dsp/                          # window / metrics / octave / envelope / bearing
├── composables/                  # useGLPlot · useAnimationLoop · useSimulator
│                                 #  · useAcousticSpectrogram · …
├── components/
│   ├── layout/                   # AppHeader · AppStatusBar · AppFooter
│   ├── common/                   # GlowCanvas · DataSourceSwitcher
│   ├── realtime/                 # AcqParamsPanel · AnalogChannelCard · FlowCard
│   │                             #  · ParticleCard · RpmCard · VibrationCard
│   │                             #  · AcousticCard · KpiPanel
│   ├── spectrum/                 # SpectrumMain · WaterfallChart · OctaveBandChart
│   │                             #  · PeakList
│   └── views/                    # RealtimeView · SpectrumView · HistoryView
│                                 #  · AlarmsView · ConfigView
└── styles/                       # tokens.css · base.css
```

---

## 性能特性 · Performance Notes

- **采样率 10 kHz / 16-bit**（模拟器分批生成绕开 setInterval 1ms 下限）
- **响应式节流**：1 kHz 写入 13 路通道 → reactive 镜像 60 Hz 刷新（避免 1.3 万次/秒触发 reactivity 链）
- **每卡独立 FPS**：CH01–CH08 / F01 / V01 5 fps · F02 1 fps · V02 / S01 / 频谱页 60 fps
- **三角函数表预计算**：FFT 旋转因子按 fftSize 缓存；Goertzel 扫频用预制 cos/sin 矩阵
- **倍频程边界缓存**：`computeOctaveBands` 改 O(30 × ~50) 仅扫每个频段内的 bin
- **WebGL context 限制感知**：所有视图 `v-if` 切换，避免超过浏览器 ~16 个 context 上限
- **瀑布图持久化**：声学 / 频谱列历史存 Pinia store，Tab 切换不丢失（带单调 total 计数器解决环形覆盖问题）

---

## 数据源 · Data Sources

切换通过顶部 `数据源 / Source` 切换器：

- **模拟演示**（默认）：物理耦合的合成波形（活塞泵脉动 / 工频谐波 / 噪声）
- **CSV 文件**：拖拽加载，自动识别时间戳列 + 分隔符（worker 解析）
- **WAV 文件**：主线程 `AudioContext.decodeAudioData` 解码 → 映射到声学通道

---

## 浏览器要求 · Browser Requirements

| 必需 | 推荐 |
|---|---|
| WebGL2 | Chrome 120+ / Safari 17+ / Firefox 121+ |
| ES2022 modules | macOS / Windows / Linux 桌面端 |
| Web Worker（module 类型） | Apple Silicon / 集成显卡足够 |

不支持 IE，不支持移动端浏览器（虽然能跑，但 13 个 GL canvas 在手机上撑不住）。

---

## 路线图 · Roadmap

已完成 (v2.0)：
- ✅ 实时监测全部卡片
- ✅ 真实 FFT pipeline + 频谱分析视图
- ✅ 中英双语
- ✅ 告警规则 + 事件持久化

待办：
- ⏳ CSV / WAV 文件回放（部分实现）
- ⏳ 历史会话录制 + 回放
- ⏳ CSV 导出 / PNG 截图
- ⏳ 轴承诊断（BPFO / BPFI / BSF / FTF + 包络解调）
- ⏳ 阶次跟踪
- ⏳ 配置 JSON 导入 / 导出

---

## License

MIT
