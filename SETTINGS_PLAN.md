# 设置界面统一规划 · Settings UI Consolidation Plan

> 目标：把目前散落在各处的可调参数，全部汇总到「**系统配置 / Config**」页，
> 同时保留各处的内联编辑入口（不删现有 UX）。
> 所有参数支持 localStorage 持久化 + JSON 导入导出 + 命名 Profile。

---

## 一、当前参数散落清单（pre-audit）

| 位置 | 参数 | 是否持久化 |
|---|---|---|
| `ConfigView` 系统配置页 | 13 路通道：使能/耦合/量程/单位/滤波 | ✅ localStorage |
| `ConfigView` | 采集：fs / 触发类型 / 触发电平 / 预/后触发 % | ✅ |
| `SpectrumMain` header | FFT size / 窗函数 / 平均次数 | ❌ 仅运行时 |
| `SpectrumMain` header | 包络模式（Envelope）| ❌ |
| `SpectrumMain` header | X 轴 Hz / Order | ❌ |
| `BearingDiagnosticPanel` | 轴承预设、Z / Pd / Bd / α、Overlay | ❌ |
| `BearingDiagnosticPanel` | 齿数 Z、齿轮 Overlay | ❌ |
| `OctaveBandChart` | A / C / 无 计权 | ❌ |
| `AppHeader` | 语言 zh / en | ✅ localStorage |
| `AppStatusBar` | 时间窗（5min / 15min / 1h …）| ❌ |
| `AlarmsView` 模态 | 告警规则增删改 | ✅ |

**结论**：诊断参数全是运行态、刷新即丢，**这是 P3 工程化最该补的洞**。

---

## 二、目标 Config 页结构（重构后）

```
┌────────────────────────────────────────────┐
│ 配置 Profile [Default ▼]  💾 保存  ⤓ 导出  ⤒ 导入  ↻ 重置 │
├────────────────────────────────────────────┤
│ [通道] [采集] [频谱] [诊断] [告警] [系统] [关于] │  ← 7 个 tab
├────────────────────────────────────────────┤
│                                              │
│        各 tab 内容（见下文 Section）           │
│                                              │
└────────────────────────────────────────────┘
```

### Tab 1 · 通道 (现有)
13 路通道表格 — 不变。

### Tab 2 · 采集 (现有)
fs / 触发 / 预后触发 — 不变。

### Tab 3 · 频谱（**新**）
- FFT size · 窗函数 · 重叠率 · 平均次数（默认值）
- 默认分析通道（V02 / S01 / CH01…）
- 默认 X 轴模式（Hz / Order）
- 默认包络模式（开 / 关）
- 倍频程计权（A / C / 无）默认值

### Tab 4 · 诊断（**新**，本次的核心）
4 个子卡片：

#### 4a · 轴承几何
| 字段 | 控件 |
|---|---|
| 轴承标签 | text input "Drive end / DE bearing" |
| 预设 | dropdown 6 种 + Custom |
| Z 滚动体数 | number 3-40 |
| Pd 节径 (mm) | number 5-500 |
| Bd 球径 (mm) | number 1-50 |
| α 接触角 (°) | number 0-45 |
| 频谱叠加 | toggle |
| **多轴承支持** | + 添加另一个轴承（选做）|

#### 4b · 齿轮
| 字段 | 控件 |
|---|---|
| 齿数 Z | number 0-200 (0=禁用) |
| 频谱叠加 | toggle |
| 双侧带数量 | number 1-3（默认 1）|

#### 4c · 包络解调
| 字段 | 控件 |
|---|---|
| 默认开启 | toggle |
| 高通截止 | number Hz（默认 500）|

#### 4d · 阶次跟踪
| 字段 | 控件 |
|---|---|
| 转速参考通道 | dropdown V01 / 手动输入 |
| 显示阶次范围 | 1× – Nx 选择 |

### Tab 5 · 告警（迁移）
告警规则编辑器从 AlarmsView 模态搬过来，作为完整列表。

### Tab 6 · 系统
- 语言 zh / en
- 主题（暗 / 浅 / 工业绿，预留）
- 默认时间窗
- localStorage 占用查看（清理按钮）

### Tab 7 · 关于
版本号、构建时间、依赖清单、GitHub 链接。

---

## 三、Profile 系统（**新核心特性**）

```
[ Default ▼ ]
  ▶ Default
    Pump-A baseline
    Pump-A 故障调查 2026-04
    + 新建 Profile
```

每个 Profile 是一个完整的 JSON：
```json
{
  "name": "Pump-A baseline",
  "createdAt": 1715260000000,
  "channels": { ... },
  "acquisition": { ... },
  "spectrum": { ... },
  "diagnostics": {
    "bearings": [{ name: "DE", preset: "SKF 6308", Z: 8, Pd: 65, ... }],
    "gear": { teeth: 0, overlay: false },
    "envelope": { enabled: false, hpHz: 500 }
  },
  "alarms": { rules: [...] },
  "system": { locale: "zh", timeWindowSec: 300 }
}
```

操作：
- 保存当前所有设置到选中 Profile
- 切换 Profile → 应用所有设置
- 复制 Profile（克隆 + 重命名）
- 删除 Profile
- JSON 导入 / 导出（单个或全部）
- LocalStorage 用 `daq-profiles` 键，Default Profile 不可删

---

## 四、技术拆解

### 新增 / 修改文件
| 文件 | 作用 |
|---|---|
| `stores/config.ts` | 扩展：新增 spectrum / diagnostics / system 子段；profile CRUD；persist watcher |
| `stores/dsp.ts` | 各诊断字段加 watcher → 同步写 configStore，双向绑定 |
| `components/views/ConfigView.vue` | 重写为 7-tab 布局 |
| `components/config/SpectrumConfigSection.vue` | 新 |
| `components/config/DiagnosticsConfigSection.vue` | 新（4 子卡） |
| `components/config/SystemConfigSection.vue` | 新 |
| `components/config/ProfileSwitcher.vue` | 新（顶部 Profile 选择 + 保存按钮）|

### 持久化策略
- 任意 dspStore 诊断字段变更 → 写入 `daq-current-config`（localStorage 防抖 300ms）
- 启动时从 `daq-current-config` 恢复诊断状态
- "保存到 Profile" 时把 current 拷贝进 `daq-profiles[name]`

### 双向同步
内联编辑（如 BearingDiagnosticPanel）和 ConfigView 编辑都通过 `dspStore` 操作，
单一数据源避免不一致。**不会删现有内联控件**，它们改的就是同一个 store。

---

## 五、分阶段交付

### Phase 1 — MVP（**1 天**，立刻有用）
- 加 Tab 导航
- 频谱 + 诊断（轴承 / 齿轮）参数搬入 ConfigView
- localStorage 自动持久化（刷新不丢）
- 不做 Profile 管理

### Phase 2 — Profile（**1.5 天**，多机器场景必备）
- ProfileSwitcher 顶部 dropdown
- 命名保存 / 切换 / 删除
- 单 Profile JSON 导入导出

### Phase 3 — 完善（**1 天**）
- 多轴承支持（同一台机器有 DE/NDE 两个轴承）
- 系统 / 关于 tab
- localStorage 占用监控

### Phase 4 — 锦上添花（按需）
- 主题切换
- 触发条件可视化预览
- 配置变更操作日志

---

## 六、推荐路径

1. **MVP 1d** — 立刻把 P2 诊断参数全部纳管 + 持久化（解决"刷新就丢"的痛点）
2. 用 1–2 天验收，看实际工作流哪些地方还想改
3. 再补 Profile 系统 + 多轴承

要我直接做 **Phase 1 MVP** 吗？还是要先调整本规划（比如想要不同的 tab 分组、想优先做 Profile 系统）？
