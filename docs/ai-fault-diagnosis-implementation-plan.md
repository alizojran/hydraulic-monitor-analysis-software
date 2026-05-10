
# AI-Assisted Fault Diagnosis: Detailed Implementation Plan

## Architectural Overview

The feature slots into the existing architecture at three integration points:
- **Storage layer**: two new `persistedStore`-backed Pinia stores (`deviceProfile`, `diagnosticLog`)
- **Logic layer**: one new composable (`useAIDiagnosis`) orchestrating prompt assembly, API calls, and result parsing
- **UI layer**: four new config-section components, one new spectrum card, one new modal, plus minimal edits to three existing files

The existing `alarms` store's `evaluateFrame` rising-edge is the natural hook for alarm-driven auto-diagnosis. The existing `FaultSummaryPanel` in `SpectrumView`'s left column is the natural host for the new AI card. `ConfigView`'s `TABS` array and `v-show` panel list need one new entry.

---

## Step 1 — TypeScript Types (`types/deviceProfile.ts` and `types/diagnostic.ts`)

### `types/deviceProfile.ts`

```ts
// ── Operating condition classification ──────────────────────────────────────
export type RpmBucket   = 'LOW' | 'MID' | 'HIGH'         // <600 / 600-1200 / >1200
export type LoadBucket  = 'LIGHT' | 'NOMINAL' | 'HEAVY'  // <40% / 40-80% / >80% rated
export type ConditionKey = `${RpmBucket}_${LoadBucket}`   // e.g. "HIGH_NOMINAL"

// ── Bearing entry in static metadata ────────────────────────────────────────
export interface DeviceBearingSpec {
  position: string          // "DE" | "NDE" | free text
  modelNumber: string       // "SKF 6205-2Z"
  ballDiamMm: number
  pitchDiamMm: number
  ballCount: number
  contactAngleDeg: number
  installedAt?: string      // ISO date string, set on last replacement
}

// ── Static metadata (Layer 1) ────────────────────────────────────────────────
export interface DeviceStaticProfile {
  deviceId: string          // "主泵 A01"
  brand: string             // "Rexroth"
  model: string             // "A10VO45DFR/31R"
  installedAt: string       // ISO date "2022-03-15"
  ratedRpm: number          // 1480
  ratedFlowLpm: number      // 50
  ratedPressureBar: number  // 280
  oilTempMinC: number       // 40
  oilTempMaxC: number       // 65
  mountingOrientation: string
  environment: string
  notes: string
  bearings: DeviceBearingSpec[]
}

// ── Baseline snapshot (one per condition bucket) ─────────────────────────────
export interface ConditionBaseline {
  conditionKey: ConditionKey
  capturedAt: string        // ISO timestamp
  rpmActual: number
  pressureBar: number
  oilTempC: number
  rmsG: number
  peakG: number
  crestFactor: number
  bpfiAmplitudeDb: number
  bpfoAmplitudeDb: number
  bsfAmplitudeDb: number
  ftfAmplitudeDb: number
  pressurePulsationRmsBar: number
  note: string
  captureCount: number      // how many 60 s windows were averaged
}

// ── AI configuration (Layer 1, stored alongside static profile) ──────────────
export interface AIConfig {
  provider: 'anthropic'
  apiKeyEncrypted: string   // AES-GCM encrypted, see §encryption note
  model: string             // "claude-sonnet-4-6"
  monthlyBudgetUsd: number
  currentMonthSpendUsd: number
  spendResetMonth: string   // "2026-05" — reset counter on month change
  enabled: boolean
  autoTriggerOnHighAlarm: boolean
}

// ── Root persisted shape ─────────────────────────────────────────────────────
export interface DeviceProfileData {
  static: DeviceStaticProfile
  baselines: Record<ConditionKey, ConditionBaseline>
  aiConfig: AIConfig
}
```

**Encryption note**: AES-GCM via `window.crypto.subtle`. Key is derived per-origin from `window.location.origin` using PBKDF2, so the ciphertext is useless outside the same origin. This is sufficient for the BYOK threat model. The store exposes `setApiKey(plaintext)` (encrypts + saves) and `getApiKeyPlaintext(): Promise<string>` (decrypts on demand).

---

### `types/diagnostic.ts`

```ts
import type { ConditionKey } from './deviceProfile'
import type { BearingFaultResult } from '@/dsp/faultClassifier'

export type DiagnosisTrigger = 'manual' | 'alarm' | 'scheduled'
export type DiagnosisConfidence = 'high' | 'medium' | 'low'
export type DiagnosisSeverity = 'critical' | 'warning' | 'advisory' | 'normal'
export type FeedbackAccuracy = 'correct' | 'incorrect' | 'unchecked'

// Snapshot of measurements at time of diagnosis
export interface DiagnosisMeasurements {
  rmsG: number
  rmsVsBaselinePct: number | null    // null when no baseline
  peakG: number
  crestFactor: number
  bpfiAmplitudeDb: number
  bpfiVsBaselineDb: number | null
  bpfoAmplitudeDb: number
  bpfoVsBaselineDb: number | null
  bsfAmplitudeDb: number
  bsfVsBaselineDb: number | null
  ftfAmplitudeDb: number
  ftfVsBaselineDb: number | null
  pressurePulsationRmsBar: number | null
  oilTempC: number | null
  rpmActual: number
  pressureBar: number | null
  // 7-day RMS trend (sparse array, newest last; null if unavailable)
  rmsTrend7d: number[] | null
}

// What the rule engine said
export interface RuleEngineSummary {
  overallSeverity: string
  findings: Pick<BearingFaultResult, 'faultType' | 'severity' | 'snrDb'>[]
}

// Parsed LLM response
export interface AIDiagnosisResult {
  fault_type: string
  severity: DiagnosisSeverity
  confidence: DiagnosisConfidence
  evidence: string[]
  recommendation: string
  recheck_interval_days: number | null
  stop_machine: boolean
  explanation: string
  // meta added by the app layer (not from LLM)
  model: string
  promptTokens: number
  completionTokens: number
  costUsd: number
  generatedAt: string        // ISO timestamp
  rawJson: string            // full LLM response, for debugging
}

// Post-maintenance feedback
export interface DiagnosticOutcome {
  recordedAt: string
  inspectionDate: string
  actualFinding: string
  diagnosisAccuracy: FeedbackAccuracy
  actionTaken: string[]       // ["换轴承", "继续观察"]
  partsReplaced: string
  postActionRmsG: number | null
  newBaselineEstablished: boolean
  notes: string
}

// Full event record (one per diagnosis)
export interface DiagnosticEvent {
  id: string                 // "evt-2026-05-10-001"
  timestamp: string          // ISO
  trigger: DiagnosisTrigger
  relatedAlarmEventId?: string
  conditionKey: ConditionKey | null
  measurements: DiagnosisMeasurements
  ruleEngine: RuleEngineSummary
  aiDiagnosis: AIDiagnosisResult | null   // null while pending or AI disabled
  outcome: DiagnosticOutcome | null       // null until feedback is provided
  status: 'pending_ai' | 'awaiting_feedback' | 'complete' | 'ai_error'
}

// The full persisted diagnostic log shape
export interface DiagnosticLogData {
  events: DiagnosticEvent[]              // capped at 20 raw entries
  compressedSummary: string | null       // LLM-generated text, null initially
  summaryGeneratedAt: string | null
  summaryCoversEventIds: string[]        // IDs included in the summary
  totalEventsEver: number                // monotonic counter even after compression
}
```

---

## Step 2 — Pinia Stores

### `stores/deviceProfile.ts`

**localStorage key**: `hmas-device-profile`, version 1

**State shape** (mirrors `DeviceProfileData`):
- `staticProfile: Ref<DeviceStaticProfile>`
- `baselines: Ref<Record<ConditionKey, ConditionBaseline>>`
- `aiConfig: Ref<AIConfig>`
- `captureInProgress: Ref<boolean>`
- `captureProgress: Ref<number>` — 0–100 during 60 s baseline capture

**Key methods**:

```ts
// Determine which condition bucket current measurements fall into
function classifyCondition(rpmActual: number, pressureBar: number): ConditionKey

// Start a 60-second background capture: samples FftResult + channelValues every 2 s,
// averages 30 snapshots, writes to baselines[key]
async function startBaselineCapture(key: ConditionKey): Promise<void>

// Retrieve baseline for current live operating condition
function getActiveBaseline(): ConditionBaseline | null

// Compute deviation of current measurements against active baseline
function computeDeviation(measurements: DiagnosisMeasurements): DeviationReport

// API key helpers (async because of crypto.subtle)
async function setApiKey(plaintext: string): Promise<void>
async function getApiKeyPlaintext(): Promise<string>

// Export / import the entire profile as JSON
function exportProfile(): string
function importProfile(json: string): void

// Internal: debounced persist
function _save(): void
```

**Deviation report type** (internal, used by composable):
```ts
interface DeviationReport {
  rmsVsBaselinePct: number
  bpfiVsBaselineDb: number
  bpfoVsBaselineDb: number
  bsfVsBaselineDb: number
  ftfVsBaselineDb: number
  baselineAge_days: number
}
```

The store watches `[staticProfile, baselines, aiConfig]` with `{ deep: true }` and debounces save by 400 ms, mirroring the `dspCompute` pattern.

---

### `stores/diagnosticLog.ts`

**localStorage key**: `hmas-diagnostic-log`, version 1

**State shape**:
- `events: Ref<DiagnosticEvent[]>` — max 20 raw entries
- `compressedSummary: Ref<string | null>`
- `summaryGeneratedAt: Ref<string | null>`
- `summaryCoversEventIds: Ref<string[]>`
- `totalEventsEver: Ref<number>`
- `compressionInProgress: Ref<boolean>`

**Key methods**:

```ts
// Append a new event (creates ID, sets status = 'pending_ai')
function createEvent(
  trigger: DiagnosisTrigger,
  conditionKey: ConditionKey | null,
  measurements: DiagnosisMeasurements,
  ruleEngine: RuleEngineSummary,
  relatedAlarmEventId?: string
): DiagnosticEvent

// After LLM responds, patch the event
function patchAiResult(eventId: string, result: AIDiagnosisResult): void

// After user submits feedback form
function recordOutcome(eventId: string, outcome: DiagnosticOutcome): void

// Returns the full context text injected into every prompt
function getHistorySummaryText(): string

// Internal: when events.length would exceed 20, trigger compression
// (compression is async and calls useAIDiagnosis internally via emit)
function _maybeCompress(): void

// Debounced localStorage persist
function _save(): void
```

The `_maybeCompress` strategy: when a 21st event is added, the store emits a Vue `app`-level custom event `hmas-compress-log` carrying the 20 events. The `useAIDiagnosis` composable listens for this at mount time and sends a compression prompt to Claude. On success it calls `patchCompression(summaryText, coveredIds)`.

---

## Step 3 — Composable `composables/useAIDiagnosis.ts`

This is the central orchestrator. It has no state of its own — state lives in the two stores above.

**Signature**:

```ts
export function useAIDiagnosis() {
  // ── Main entry point ────────────────────────────────────────────────────
  // Called from AIDiagnosisCard's "Analyze" button or alarm hook
  async function runDiagnosis(
    trigger: DiagnosisTrigger,
    relatedAlarmEventId?: string
  ): Promise<DiagnosticEvent>

  // ── Internal: snapshot current state for the prompt ─────────────────────
  function _snapshotMeasurements(): DiagnosisMeasurements

  // ── Internal: build the full prompt pair ────────────────────────────────
  function _buildPrompt(
    profile: DeviceStaticProfile,
    baseline: ConditionBaseline | null,
    deviation: DeviationReport | null,
    measurements: DiagnosisMeasurements,
    ruleEngine: RuleEngineSummary,
    historySummary: string | null
  ): { systemPrompt: string; userPrompt: string }

  // ── Internal: call Anthropic Messages API (streaming) ───────────────────
  async function _callClaude(
    systemPrompt: string,
    userPrompt: string,
    onChunk: (partial: string) => void
  ): Promise<{ content: string; inputTokens: number; outputTokens: number }>

  // ── Internal: parse + validate JSON from LLM response ───────────────────
  function _parseResult(raw: string, model: string, tokens: {in:number,out:number}): AIDiagnosisResult

  // ── Compression prompt (called by diagnosticLog._maybeCompress path) ─────
  async function compressHistory(events: DiagnosticEvent[]): Promise<string>

  // ── Streaming state for UI ───────────────────────────────────────────────
  const isRunning: Ref<boolean>
  const streamBuffer: Ref<string>   // partial text shown while streaming
  const lastError: Ref<string | null>

  return { runDiagnosis, compressHistory, isRunning, streamBuffer, lastError }
}
```

**`_snapshotMeasurements()` logic**: reads from `useDspComputeStore().fftResult` (for bearing amplitudes, rms, crest factor), `useAcquisitionStore().channelValues` (for pressure = CH01, temp = CH05, rpm = V01), `useBearingModelStore()` (for frequency geometry), and calls `deviceProfileStore.computeDeviation()` to get the vs-baseline deltas. The 7-day RMS trend comes from `spectrumHistoryStore` — the plan is to read the last 7 snapshot points recorded at session-level granularity. Since the codebase does not yet have session-level RMS persistence, for Phase 1/2 this field is `null`; Phase 4 can add a lightweight rolling daily RMS capture to `diagnosticLog` during `recordOutcome`.

**`_buildPrompt()` logic**: produces exactly the system prompt and user prompt from section 4.2 of the design doc. Key assembly decisions:
- The bearing amplitudes are read from `FftResult.magnitudeDb` at the exact bin closest to each bearing frequency computed by `computeBearingFrequencies()`.
- Each `DeviceBearingSpec.installedAt` drives the "last replaced" line.
- `historySummary` is `diagnosticLogStore.getHistorySummaryText()`.
- If no baseline exists for the current condition, the measurements section omits "vs baseline" deltas and adds a note "（尚未建立此工况基线）".

**`_callClaude()` logic**: uses `fetch()` against `https://api.anthropic.com/v1/messages` with `stream: true`. Authorization header uses the decrypted key from `deviceProfileStore.getApiKeyPlaintext()`. SSE parsing handles `data:` lines, accumulates text, and calls `onChunk` for each content block delta. On completion it reads `usage` from the final `message_delta` event to get token counts. Network errors or non-200 status throw a typed error that the caller shows in `lastError`.

**Budget enforcement**: before calling, check `aiConfig.currentMonthSpendUsd + estimatedCost > aiConfig.monthlyBudgetUsd`. If over budget and `trigger !== 'manual'`, skip the call and set status to `'ai_error'` with message "月度预算已达上限". Manual calls still proceed with a warning badge.

---

## Step 4 — New Components

### `components/config/DeviceProfileSection.vue`

**Purpose**: static metadata form (Layer 1)

**Props**: none (reads/writes `useDeviceProfileStore()` directly)

**Structure**:
- A `cfg-grid`-style form with `cfg-row` rows matching the style of `SystemConfigSection.vue`
- Fields: deviceId, brand, model, installedAt (date input), ratedRpm, ratedFlowLpm, ratedPressureBar, oilTempMin/Max, mountingOrientation, environment, notes
- Below: a `BearingSpecEditor` sub-section (inline, not a separate component) — a small table showing `bearings[]` with Add/Remove buttons. Each row: position (text), modelNumber (text), Bd/Pd/Z/α (number inputs). Clicking a bearing model field shows a `<select>` populated from `BEARING_PRESETS` (imported from `bearingModel.ts`) to auto-fill the geometry values.
- Bottom toolbar: `[导出档案]` `[导入档案]` (triggers `deviceProfileStore.exportProfile()` / `importProfile()`)

**Emits**: none

**i18n keys needed** (new under `config.deviceProfile.*`):
`deviceId`, `brand`, `model`, `installedAt`, `ratedRpm`, `ratedFlow`, `ratedPressure`, `oilTemp`, `mounting`, `environment`, `notes`, `bearings`, `bearingPosition`, `bearingModel`, `addBearing`, `exportProfile`, `importProfile`

---

### `components/config/BaselineManager.vue`

**Purpose**: view and manage the 9-bucket baseline library (Layer 2)

**Props**: none

**Structure**:
- Section title "工况基线库 / Condition Baselines"
- A table with columns: 工况 | 建立时间 | RMS | CF | BPFI | 状态 | 操作
- Each of the 9 `ConditionKey` combinations is a row. If no baseline exists, the cells show "—" and the 操作 column shows `[建立基线]`. If a baseline exists: show its values, a staleness warning if `capturedAt` is >2 years old (orange text), and `[重建]` / `[删除]` buttons.
- Clicking `[建立基线]` or `[重建]` calls `deviceProfileStore.startBaselineCapture(key)`. During capture: a progress bar (`captureProgress`) fills over 60 s, the button becomes disabled and shows "采集中 45s…".
- A `<select>` above the table lets the user manually select which condition bucket to capture (rather than auto-classifying from current data), so baselines can be built for conditions not currently active.
- An info banner: "设备健康时建立基线，换件后应重建" (dismissible).

**Emits**: none

---

### `components/config/AIConfigSection.vue`

**Purpose**: API key, model selection, budget settings

**Props**: none

**Structure** (matches `SystemConfigSection.vue` grid layout):
- Provider selector: currently only "Anthropic Claude" — a `<select>` with one option (leaves room for future expansion)
- API Key field: `<input type="password">` showing masked value. An eye icon toggles visibility. On blur, calls `deviceProfileStore.setApiKey(value)`. Shows a green "已保存" badge for 2 s after save. A warning: "仅在可信设备上输入 API Key".
- Model selector: `<select>` with options `claude-opus-4-5`, `claude-sonnet-4-6`, `claude-haiku-3-5`
- Monthly budget: `<input type="number">` USD + current month spend shown below as `"本月已用: $0.12 / $50.00"`
- Enable toggle: "启用 AI 分析" checkbox
- Auto-trigger toggle: "高严重度告警时自动触发" checkbox
- Test connection button: `[测试连接]` — sends a minimal `messages` API call ("Reply OK") to verify the key, shows result inline

**Emits**: none

---

### `components/spectrum/AIDiagnosisCard.vue`

**Purpose**: displays the AI analysis result below `FaultSummaryPanel` in the spectrum left panel

**Props**: none (reads `useDiagnosticLogStore()` and `useAIDiagnosis()` directly)

**Computed**:
- `latestEvent`: `diagnosticLogStore.events[events.length - 1]` — the most recent event
- `aiResult`: `latestEvent?.aiDiagnosis ?? null`

**Template structure**:

```
┌─ AI ANALYSIS ─────── [🤖 重新分析] ──────────────────────┐
│  [streaming spinner | severity badge + fault_type + conf] │
│  explanation text (2-4 lines)                             │
│  建议: recommendation text                                │
│  [记录到日志]   timestamp   [反馈结果]                    │
└───────────────────────────────────────────────────────────┘
```

States:
- **No AI config**: faded card with "请在设备档案 > AI 配置中设置 API Key"
- **No FFT data**: "等待频谱数据…"
- **Running** (`isRunning`): animated text streaming from `streamBuffer`, spinner icon
- **Result**: severity icon + fault_type badge + confidence label, explanation, recommendation, metadata row
- **Error** (`lastError`): red error text + retry button
- **stop_machine: true**: an orange banner "⚠️ AI 建议停机 — 需要人工确认" with a dismiss button

The `[🤖 重新分析]` button calls `useAIDiagnosis().runDiagnosis('manual')`.

The `[记录到日志]` button is visible when `aiResult !== null` and `latestEvent.status === 'pending_ai'` — but actually the log is written automatically; this button is a visual confirmation, not a required action. It can instead navigate the user to the Alarms tab.

The `[反馈结果]` button opens `DiagnosticFeedbackModal` for the latest event.

**Severity coloring**: maps `AIDiagnosisResult.severity` to the existing CSS variables (`--red`, `--amber`, `var(--cyan)`, `--green`) using the same `.sev-critical / .sev-warning` classes already defined in `FaultSummaryPanel.vue`.

**i18n keys** (new under `spectrum.aiAnalysis.*`):
`title`, `reanalyze`, `logEvent`, `feedback`, `noConfig`, `waiting`, `stopMachineWarning`, `confidence.high/medium/low`, `errorRetry`

---

### `components/alarms/DiagnosticFeedbackModal.vue`

**Purpose**: maintenance result feedback form (post-repair)

**Props**:
```ts
defineProps<{
  eventId: string
  modelValue: boolean   // v-model for open/close
}>()
defineEmits(['update:modelValue'])
```

**Structure** (modal dialog using a `<teleport to="body">`):
- Title "维修/检查结果记录"
- Form fields:
  - 检查日期: `<input type="date">`
  - 实际发现: `<textarea>`
  - AI诊断正确: radio group `correct | incorrect | unchecked`
  - 采取措施: checkboxes `['换轴承', '继续观察', '密封件', '其他']`
  - 更换部件型号: `<input type="text">`
  - 维修后RMS (g): `<input type="number">`
  - 更新基线: checkbox — when checked, triggers `deviceProfileStore.startBaselineCapture(event.conditionKey)` on save
  - 备注: `<textarea>`
- Buttons: `[取消]` `[保存结果]`
- On save: calls `diagnosticLogStore.recordOutcome(eventId, formData)`, emits `update:modelValue` with `false`

The modal also appears from `AlarmEventLog.vue`'s "待反馈" button column entry.

---

## Step 5 — Modifications to Existing Files

### `components/views/ConfigView.vue`

Two changes:

1. Add a new tab to `TABS`:
```ts
{ id: 'device-profile', labelKey: 'config.tabs.deviceProfile' }
```

2. Add the corresponding `v-show` panel after the `about` panel:
```html
<div v-show="activeTab === 'device-profile'" class="tab-pane">
  <DeviceProfileSection />
  <div class="section-divider" />
  <BaselineManager />
  <div class="section-divider" />
  <AIConfigSection />
</div>
```

3. Import the three new components at the top of `<script setup>`.

No other changes to `ConfigView.vue` are needed.

---

### `components/spectrum/FaultSummaryPanel.vue` (SpectrumView layout)

`FaultSummaryPanel.vue` itself does not change internally. Instead, `SpectrumView.vue` is modified to add `AIDiagnosisCard` directly below `FaultSummaryPanel` in the left column:

```html
<FaultSummaryPanel />
<div class="divider" />
<AIDiagnosisCard />      <!-- new -->
<div class="divider" />
<OctaveBandChart />
```

The left column is already `overflow-y: auto` so the extra height is handled automatically.

---

### `stores/alarms.ts` — alarm-driven auto-diagnosis hook

In `evaluateFrame`, on the rising-edge branch where a new `AlarmEvent` is created:

```ts
// After pushing event to events.value:
if (
  (rule.severity === 'high') &&
  deviceProfileStore.aiConfig.enabled &&
  deviceProfileStore.aiConfig.autoTriggerOnHighAlarm
) {
  // Fire-and-forget, does not block evaluateFrame
  void triggerAIOnAlarm(event.id)
}
```

`triggerAIOnAlarm` is a module-level function (not exported) that imports `useAIDiagnosis` lazily to avoid circular imports:

```ts
async function triggerAIOnAlarm(alarmEventId: string) {
  const { runDiagnosis } = useAIDiagnosis()
  await runDiagnosis('alarm', alarmEventId)
}
```

This is the only change to `alarms.ts`. `useDeviceProfileStore` must be imported at the top of the file.

---

### `components/alarms/AlarmEventLog.vue`

Three changes:

1. Add a new column header `<th>AI 诊断</th>` in the table head.

2. In each `<tr>`, add a cell that shows:
   - Nothing if the alarm's `id` is not referenced by any `DiagnosticEvent`
   - `[待反馈 ▶]` badge (amber) if a `DiagnosticEvent` exists with `status === 'awaiting_feedback'` and `relatedAlarmEventId === ev.id`
   - The `fault_type` + confidence in a small badge if `status === 'complete'`

3. The `[待反馈 ▶]` button `@click` opens `DiagnosticFeedbackModal` with the matching `eventId`. A `ref<string | null>` called `feedbackEventId` and a `ref<boolean>` called `showFeedbackModal` drive the `v-model` on the modal component.

The lookup is done via a computed:
```ts
const alarmDiagnosticMap = computed(() => {
  const map: Record<string, DiagnosticEvent> = {}
  for (const ev of diagnosticLogStore.events) {
    if (ev.relatedAlarmEventId) map[ev.relatedAlarmEventId] = ev
  }
  return map
})
```

---

### `locales/zh.json` and `locales/en.json`

Add the following new key groups (abbreviated here, full strings inferred from context):

```json
// zh.json additions
"config": {
  "tabs": { "deviceProfile": "设备档案" },
  "deviceProfile": {
    "staticTitle": "基本信息",
    "baselineTitle": "工况基线库",
    "aiTitle": "AI 配置",
    "deviceId": "设备编号",
    "brand": "品牌",
    "model": "型号",
    "installedAt": "安装日期",
    "ratedRpm": "额定转速 (rpm)",
    "ratedFlow": "额定流量 (L/min)",
    "ratedPressure": "最高压力 (bar)",
    "oilTempRange": "工作油温 (°C)",
    "mounting": "安装方式",
    "environment": "安装环境",
    "notes": "备注",
    "bearings": "轴承配置",
    "bearingPosition": "位置",
    "bearingModel": "型号",
    "addBearing": "+ 添加轴承",
    "exportProfile": "导出档案",
    "importProfile": "导入档案",
    "baselineCaptureBtn": "建立基线",
    "baselineRebuildBtn": "重建",
    "baselineDeleteBtn": "删除",
    "baselineCapturing": "采集中…",
    "baselineStaleWarning": "基线已超过2年，建议重建",
    "baselineNoBuildHint": "设备健康时建立基线，换件后应重建",
    "aiProvider": "AI 服务商",
    "apiKey": "API Key",
    "aiModel": "模型",
    "monthlyBudget": "月度预算 (USD)",
    "currentSpend": "本月已用",
    "enableAI": "启用 AI 分析",
    "autoTrigger": "高告警自动触发",
    "testConnection": "测试连接",
    "apiKeyWarning": "仅在可信设备上输入 API Key"
  }
},
"spectrum": {
  "aiAnalysis": {
    "title": "AI 分析",
    "reanalyze": "重新分析",
    "logEvent": "记录到日志",
    "feedback": "反馈结果",
    "noConfig": "请配置 API Key",
    "waiting": "等待频谱数据…",
    "stopMachineWarning": "AI 建议停机 — 需要人工确认",
    "errorRetry": "重试",
    "confidence": {
      "high": "高置信",
      "medium": "中置信",
      "low": "低置信"
    }
  }
},
"diagnosticLog": {
  "feedbackTitle": "维修/检查结果记录",
  "inspectionDate": "检查日期",
  "actualFinding": "实际发现",
  "aiAccuracy": "AI诊断正确",
  "accuracy": { "correct": "是", "incorrect": "否", "unchecked": "未检查" },
  "actionTaken": "采取措施",
  "partsReplaced": "更换部件",
  "postActionRms": "维修后 RMS (g)",
  "updateBaseline": "更新基线",
  "feedbackNotes": "备注",
  "saveFeedback": "保存结果",
  "pendingFeedback": "待反馈",
  "actions": {
    "replaceBearing": "换轴承",
    "monitor": "继续观察",
    "replaceSeal": "换密封件",
    "other": "其他"
  }
}
```

Mirror all entries in `en.json` with English translations.

---

## Step 6 — Implementation Order by Phase

### Phase 1 — Basic data collection, no LLM (Deliverable: baseline deviations shown in UI)

Implement in this exact sequence to respect inter-file dependencies:

1. **`types/deviceProfile.ts`** — all types, no dependencies
2. **`types/diagnostic.ts`** — depends on deviceProfile types
3. **`stores/deviceProfile.ts`** — depends on `persistedStore`, `bearingModel` (for BEARING_PRESETS), `dspCompute` (for live FFT result during capture), `acquisition` (for live channel values)
4. **`components/config/DeviceProfileSection.vue`** — depends on store
5. **`components/config/BaselineManager.vue`** — depends on store
6. **Add "设备档案" tab to `ConfigView.vue`** — depends on the two above components; add `AIConfigSection` as an empty stub here
7. **Add zh/en i18n keys** for `config.deviceProfile.*`
8. **Verify**: user can fill static metadata, click "建立基线", see 60 s progress bar, and see the baseline saved in the table

### Phase 2 — Diagnostic snapshot assembler, no LLM (Deliverable: clicking "AI 诊断" shows the assembled prompt text)

9. **`stores/diagnosticLog.ts`** — depends on types from Phase 1; at this phase, `createEvent` works but `patchAiResult` / `_maybeCompress` are stubs
10. **`composables/useAIDiagnosis.ts`** — implement `_snapshotMeasurements`, `_buildPrompt`, and a mock `runDiagnosis` that calls the real snapshot + prompt build but instead of calling Claude, just stores the prompt text in `streamBuffer` for display
11. **`components/spectrum/AIDiagnosisCard.vue`** — implement full UI but wire the "streaming" state to show `streamBuffer` (which at this phase contains the assembled prompt text, not an LLM response)
12. **Modify `SpectrumView.vue`** to include `AIDiagnosisCard`
13. **Add zh/en i18n keys** for `spectrum.aiAnalysis.*`
14. **Verify**: clicking "🤖 重新分析" shows a formatted text block of what would be sent to the LLM, including device profile, baseline deviations, and rule engine findings

### Phase 3 — Full LLM integration (Deliverable: end-to-end Claude call + result display)

15. **`components/config/AIConfigSection.vue`** — full implementation with API key save/encrypt, test connection
16. **Complete `useAIDiagnosis.ts`**: implement `_callClaude` (streaming fetch), `_parseResult`, budget enforcement, error handling; replace the Phase 2 mock `runDiagnosis` with the real implementation
17. **Complete `stores/diagnosticLog.ts`**: implement `patchAiResult`, `recordOutcome`, `getHistorySummaryText`
18. **Modify `stores/alarms.ts`**: add the rising-edge auto-trigger hook
19. **Add zh/en i18n keys** for `diagnosticLog.feedbackTitle` etc.
20. **Verify**: configure API Key → click "重新分析" → see streaming response → see structured result card → confirm event appears in log

### Phase 4 — Feedback loop + log compression (Deliverable: full maintenance feedback cycle, prompt includes history)

21. **`components/alarms/DiagnosticFeedbackModal.vue`** — full form implementation
22. **Modify `AlarmEventLog.vue`**: add AI diagnosis column + "待反馈" button + modal wiring
23. **Complete `stores/diagnosticLog.ts`**: implement `_maybeCompress` compression trigger via `hmas-compress-log` custom event
24. **Complete `useAIDiagnosis.ts`**: implement `compressHistory` (builds the compression prompt, calls Claude, returns text); add event listener for `hmas-compress-log` in the composable's `onMounted`
25. **Verify**: after filling 3+ feedback records, confirm `getHistorySummaryText()` returns non-empty text that appears in the next prompt's "设备历史摘要" section

---

## Key Design Decisions and Rationale

**Why not extend the existing `profiles` store?** Device profile data is device-scoped, not operator-session-scoped. Mixing it into `ProfileSnapshot` (which already bundles channel config, FFT params, etc.) would make profiles too large and create confusion when switching profiles on the same device.

**Why a custom event for compression instead of direct store-to-composable call?** The `diagnosticLog` store must not import `useAIDiagnosis` (that composable imports the store, creating a circular dependency). The `hmas-compress-log` custom event breaks the cycle cleanly, consistent with the existing `hmas-storage-quota` pattern in `persistedStore.ts`.

**Why keep `AlarmEvent` unchanged instead of adding `aiDiagnosisId` to it?** `DiagnosticEvent.relatedAlarmEventId` is a forward reference from the diagnosis side. This avoids touching the persisted `AlarmEvent` schema and its migration version, while still enabling the lookup via the computed `alarmDiagnosticMap` in `AlarmEventLog`.

**Why AES-GCM for the API key rather than plain storage?** The existing `SystemConfigSection` stores everything plain. An API key is closer to a credential than a config value — encrypting it means a localStorage dump (e.g. from a browser extension) cannot trivially extract it. The threat model is casual exfiltration, not a sophisticated attacker, so browser-derived key material is acceptable.

**Why separate `hmas-device-profile` and `hmas-diagnostic-log` keys?** The log will be compressed and overwritten frequently; the static profile is write-rarely. Separating them avoids a multi-kilobyte write on every diagnosis event just to update the log portion.

---

### Critical Files for Implementation

- `/home/user/hydraulic-monitor-analysis-software/v2/src/utils/persistedStore.ts`
- `/home/user/hydraulic-monitor-analysis-software/v2/src/stores/alarms.ts`
- `/home/user/hydraulic-monitor-analysis-software/v2/src/components/views/ConfigView.vue`
- `/home/user/hydraulic-monitor-analysis-software/v2/src/components/spectrum/FaultSummaryPanel.vue`
- `/home/user/hydraulic-monitor-analysis-software/v2/src/components/views/SpectrumView.vue`