/**
 * AI fault diagnosis orchestrator.
 *
 * State (`isRunning`, `streamBuffer`, `lastError`) is module-level singleton —
 * `runDiagnosis` and `compressHistory` can be called from anywhere (Pinia
 * actions, custom event handlers), not only from a Vue setup() context.
 */
import { ref } from 'vue'
import { useDeviceProfileStore } from '@/stores/deviceProfile'
import { useDiagnosticLogStore } from '@/stores/diagnosticLog'
import { useDspComputeStore } from '@/stores/dspCompute'
import { useAcquisitionStore } from '@/stores/acquisition'
import { useBearingModelStore } from '@/stores/bearingModel'
import { computeBearingFrequencies } from '@/dsp/bearing'
import { classifyBearingFaults, overallSeverity } from '@/dsp/faultClassifier'
import type {
  AIDiagnosisResult,
  CompressLogEventDetail,
  DiagnosisMeasurements,
  DiagnosisTrigger,
  DiagnosticEvent,
  RuleEngineSummary,
} from '@/types/diagnostic'
import type { ConditionBaseline, DeviationReport, DeviceStaticProfile } from '@/types/deviceProfile'

// ── Module-level singleton state ────────────────────────────────────────────
const isRunning = ref(false)
const streamBuffer = ref('')
const lastError = ref<string | null>(null)

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages'

// Approximate USD pricing per 1M tokens for budget tracking
const PRICING_USD_PER_M: Record<string, { in: number; out: number }> = {
  'claude-opus-4-7': { in: 15, out: 75 },
  'claude-opus-4-5': { in: 15, out: 75 },
  'claude-sonnet-4-6': { in: 3, out: 15 },
  'claude-haiku-4-5-20251001': { in: 0.8, out: 4 },
  'claude-haiku-3-5': { in: 0.8, out: 4 },
}

function estimateCostUsd(model: string, inputTokens: number, outputTokens: number): number {
  const p = PRICING_USD_PER_M[model] ?? { in: 3, out: 15 }
  return (inputTokens * p.in + outputTokens * p.out) / 1_000_000
}

function ampDbAt(magnitudeDb: Float32Array, frequencies: Float32Array, targetHz: number): number {
  if (targetHz <= 0 || magnitudeDb.length === 0) return -120
  let bestIdx = 0
  let bestDelta = Infinity
  for (let i = 0; i < frequencies.length; i++) {
    const d = Math.abs(frequencies[i] - targetHz)
    if (d < bestDelta) {
      bestDelta = d
      bestIdx = i
    }
  }
  return magnitudeDb[bestIdx] ?? -120
}

// ── Snapshot current measurements ───────────────────────────────────────────
function snapshotMeasurements(): {
  measurements: DiagnosisMeasurements
  ruleEngine: RuleEngineSummary
  deviation: DeviationReport | null
} {
  const profile = useDeviceProfileStore()
  const dsp = useDspComputeStore()
  const acq = useAcquisitionStore()
  const bearingModel = useBearingModelStore()

  const fft = dsp.fftResult
  const rpm = acq.channelValues['V01'] ?? 0
  const pressure = acq.channelValues['CH01'] ?? null
  const oilTemp = acq.channelValues['CH05'] ?? acq.channelValues['CH06'] ?? null

  const bearing = bearingModel.bearings[0]
  let bpfiDb = -120
  let bpfoDb = -120
  let bsfDb = -120
  let ftfDb = -120
  let ruleFindings: RuleEngineSummary = { overallSeverity: 'none', findings: [] }

  if (fft && bearing && rpm > 0) {
    const geo = computeBearingFrequencies({ ...bearing.params, rpmHz: rpm / 60 })
    bpfiDb = ampDbAt(fft.magnitudeDb, fft.frequencies, geo.bpfi)
    bpfoDb = ampDbAt(fft.magnitudeDb, fft.frequencies, geo.bpfo)
    bsfDb = ampDbAt(fft.magnitudeDb, fft.frequencies, geo.bsf)
    ftfDb = ampDbAt(fft.magnitudeDb, fft.frequencies, geo.ftf)
    const faults = classifyBearingFaults(fft.magnitudeDb, fft.frequencies, geo)
    ruleFindings = {
      overallSeverity: overallSeverity(faults),
      findings: faults.map((f) => ({
        faultType: f.faultType,
        severity: f.severity,
        snrDb: f.snrDb,
      })),
    }
  }

  const measurements: DiagnosisMeasurements = {
    rmsG: fft?.rms ?? 0,
    rmsVsBaselinePct: null,
    peakG: fft?.peakValue ?? 0,
    crestFactor: fft?.crestFactor ?? 0,
    bpfiAmplitudeDb: bpfiDb,
    bpfiVsBaselineDb: null,
    bpfoAmplitudeDb: bpfoDb,
    bpfoVsBaselineDb: null,
    bsfAmplitudeDb: bsfDb,
    bsfVsBaselineDb: null,
    ftfAmplitudeDb: ftfDb,
    ftfVsBaselineDb: null,
    pressurePulsationRmsBar: null,
    oilTempC: oilTemp,
    rpmActual: rpm,
    pressureBar: pressure,
    rmsTrend7d: null,
  }

  const deviation = profile.computeDeviation(measurements)
  if (deviation) {
    measurements.rmsVsBaselinePct = deviation.rmsVsBaselinePct
    measurements.bpfiVsBaselineDb = deviation.bpfiVsBaselineDb
    measurements.bpfoVsBaselineDb = deviation.bpfoVsBaselineDb
    measurements.bsfVsBaselineDb = deviation.bsfVsBaselineDb
    measurements.ftfVsBaselineDb = deviation.ftfVsBaselineDb
  }

  return { measurements, ruleEngine: ruleFindings, deviation }
}

// ── Build prompt ────────────────────────────────────────────────────────────
function buildPrompt(
  staticProfile: DeviceStaticProfile,
  baseline: ConditionBaseline | null,
  deviation: DeviationReport | null,
  measurements: DiagnosisMeasurements,
  ruleEngine: RuleEngineSummary,
  historySummary: string,
): { systemPrompt: string; userPrompt: string } {
  const systemPrompt = [
    'You are a hydraulic equipment fault diagnosis expert. Analyze the structured measurement data',
    'against the device profile and historical context, then return ONLY a JSON object with these',
    'exact fields:',
    '{',
    '  "fault_type": "string",',
    '  "severity": "critical" | "warning" | "advisory" | "normal",',
    '  "confidence": "high" | "medium" | "low",',
    '  "evidence": ["string", ...],',
    '  "recommendation": "string",',
    '  "recheck_interval_days": number | null,',
    '  "stop_machine": boolean,',
    '  "explanation": "string (≤120 字)"',
    '}',
    'Do not include any text outside the JSON. Use the same language as the user prompt.',
  ].join('\n')

  const lines: string[] = []
  lines.push('## 设备档案 / Device Profile')
  lines.push(`- 设备编号: ${staticProfile.deviceId || '(未填)'}`)
  lines.push(`- 品牌型号: ${staticProfile.brand} ${staticProfile.model}`)
  lines.push(`- 安装日期: ${staticProfile.installedAt || '(未填)'}`)
  lines.push(
    `- 额定参数: ${staticProfile.ratedRpm} rpm / ${staticProfile.ratedFlowLpm} L·min⁻¹ / ${staticProfile.ratedPressureBar} bar`,
  )
  lines.push(`- 工作油温: ${staticProfile.oilTempMinC}–${staticProfile.oilTempMaxC} °C`)
  if (staticProfile.bearings.length > 0) {
    lines.push('- 轴承配置:')
    for (const b of staticProfile.bearings) {
      lines.push(
        `  · ${b.position} ${b.modelNumber} (Z=${b.ballCount}, Pd=${b.pitchDiamMm}mm, Bd=${b.ballDiamMm}mm, α=${b.contactAngleDeg}°)${b.installedAt ? `, 上次更换 ${b.installedAt}` : ''}`,
      )
    }
  }
  if (staticProfile.notes) lines.push(`- 备注: ${staticProfile.notes}`)

  lines.push('')
  lines.push('## 当前测量 / Current Measurements')
  lines.push(`- 转速: ${measurements.rpmActual.toFixed(0)} rpm`)
  lines.push(
    `- 压力: ${measurements.pressureBar !== null ? measurements.pressureBar.toFixed(1) + ' bar' : 'N/A'}`,
  )
  lines.push(
    `- 油温: ${measurements.oilTempC !== null ? measurements.oilTempC.toFixed(1) + ' °C' : 'N/A'}`,
  )
  lines.push(
    `- 振动 RMS: ${measurements.rmsG.toFixed(3)} g${measurements.rmsVsBaselinePct !== null ? ` (基线偏差 ${measurements.rmsVsBaselinePct >= 0 ? '+' : ''}${measurements.rmsVsBaselinePct.toFixed(1)}%)` : ' (尚未建立此工况基线)'}`,
  )
  lines.push(
    `- Peak: ${measurements.peakG.toFixed(3)} g, CF: ${measurements.crestFactor.toFixed(2)}`,
  )
  lines.push('- 轴承故障频率幅值 (dB):')
  const baseDelta = (v: number | null) =>
    v === null ? '' : ` Δ${v >= 0 ? '+' : ''}${v.toFixed(1)}dB`
  lines.push(
    `  · BPFI: ${measurements.bpfiAmplitudeDb.toFixed(1)}${baseDelta(measurements.bpfiVsBaselineDb)}`,
  )
  lines.push(
    `  · BPFO: ${measurements.bpfoAmplitudeDb.toFixed(1)}${baseDelta(measurements.bpfoVsBaselineDb)}`,
  )
  lines.push(
    `  · BSF:  ${measurements.bsfAmplitudeDb.toFixed(1)}${baseDelta(measurements.bsfVsBaselineDb)}`,
  )
  lines.push(
    `  · FTF:  ${measurements.ftfAmplitudeDb.toFixed(1)}${baseDelta(measurements.ftfVsBaselineDb)}`,
  )

  if (baseline) {
    lines.push('')
    lines.push(
      `## 基线参考 (工况 ${baseline.conditionKey}, 采集于 ${baseline.capturedAt.slice(0, 10)})`,
    )
    lines.push(
      `- RMS: ${baseline.rmsG.toFixed(3)} g, BPFI: ${baseline.bpfiAmplitudeDb.toFixed(1)} dB, BPFO: ${baseline.bpfoAmplitudeDb.toFixed(1)} dB`,
    )
    if (deviation && deviation.baselineAgeDays > 730) {
      lines.push('- ⚠️ 基线已超过 2 年，参考价值降低')
    }
  }

  lines.push('')
  lines.push('## 规则引擎结论 / Rule Engine')
  lines.push(`- 整体严重度: ${ruleEngine.overallSeverity}`)
  for (const f of ruleEngine.findings) {
    lines.push(`- ${f.faultType}: ${f.severity} (SNR ${f.snrDb.toFixed(1)} dB)`)
  }

  if (historySummary.trim()) {
    lines.push('')
    lines.push('## 设备历史摘要 / Device History')
    lines.push(historySummary.trim())
  }

  lines.push('')
  lines.push('请基于以上信息给出 JSON 诊断结果。')

  return { systemPrompt, userPrompt: lines.join('\n') }
}

// ── Streaming Anthropic API call ────────────────────────────────────────────
async function callClaude(
  apiKey: string,
  model: string,
  systemPrompt: string,
  userPrompt: string,
  onChunk: (partial: string) => void,
): Promise<{ content: string; inputTokens: number; outputTokens: number }> {
  const body = {
    model,
    max_tokens: 1024,
    system: systemPrompt,
    messages: [{ role: 'user', content: userPrompt }],
    stream: true,
  }

  const resp = await fetch(ANTHROPIC_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify(body),
  })

  if (!resp.ok) {
    const errText = await resp.text().catch(() => resp.statusText)
    throw new Error(`Anthropic API ${resp.status}: ${errText.slice(0, 200)}`)
  }
  if (!resp.body) {
    throw new Error('Anthropic API returned empty body')
  }

  const reader = resp.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let content = ''
  let inputTokens = 0
  let outputTokens = 0

  while (true) {
    const { value, done } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''
    for (const line of lines) {
      if (!line.startsWith('data: ')) continue
      const payload = line.slice(6).trim()
      if (!payload || payload === '[DONE]') continue
      try {
        const evt = JSON.parse(payload) as {
          type: string
          delta?: { text?: string; type?: string }
          message?: { usage?: { input_tokens?: number; output_tokens?: number } }
          usage?: { input_tokens?: number; output_tokens?: number }
        }
        if (evt.type === 'content_block_delta' && evt.delta?.text) {
          content += evt.delta.text
          onChunk(content)
        } else if (evt.type === 'message_start' && evt.message?.usage) {
          inputTokens = evt.message.usage.input_tokens ?? 0
        } else if (evt.type === 'message_delta' && evt.usage) {
          outputTokens = evt.usage.output_tokens ?? outputTokens
        }
      } catch {
        // ignore malformed SSE chunk
      }
    }
  }

  return { content, inputTokens, outputTokens }
}

// ── Parse + validate LLM JSON response ──────────────────────────────────────
function parseResult(
  raw: string,
  model: string,
  inputTokens: number,
  outputTokens: number,
): AIDiagnosisResult {
  const jsonMatch = raw.match(/\{[\s\S]*\}/)
  if (!jsonMatch) throw new Error('LLM response contained no JSON object')
  const obj = JSON.parse(jsonMatch[0]) as Partial<AIDiagnosisResult>
  if (typeof obj.fault_type !== 'string' || typeof obj.explanation !== 'string') {
    throw new Error('LLM JSON missing required fields')
  }
  const cost = estimateCostUsd(model, inputTokens, outputTokens)
  return {
    fault_type: obj.fault_type,
    severity: (obj.severity ?? 'normal') as AIDiagnosisResult['severity'],
    confidence: (obj.confidence ?? 'low') as AIDiagnosisResult['confidence'],
    evidence: Array.isArray(obj.evidence) ? obj.evidence : [],
    recommendation: typeof obj.recommendation === 'string' ? obj.recommendation : '',
    recheck_interval_days:
      typeof obj.recheck_interval_days === 'number' ? obj.recheck_interval_days : null,
    stop_machine: Boolean(obj.stop_machine),
    explanation: obj.explanation,
    model,
    promptTokens: inputTokens,
    completionTokens: outputTokens,
    costUsd: cost,
    generatedAt: new Date().toISOString(),
    rawJson: raw,
  }
}

// ── Build a "preview" pseudo-result from prompt text (Phase 2 mode) ─────────
function previewFromPrompt(systemPrompt: string, userPrompt: string): string {
  return `=== System Prompt ===\n${systemPrompt}\n\n=== User Prompt ===\n${userPrompt}`
}

// ── Main entry: run a diagnosis ─────────────────────────────────────────────
export async function runDiagnosis(
  trigger: DiagnosisTrigger,
  relatedAlarmEventId?: string,
): Promise<DiagnosticEvent | null> {
  if (isRunning.value) return null
  isRunning.value = true
  streamBuffer.value = ''
  lastError.value = null

  const profile = useDeviceProfileStore()
  const log = useDiagnosticLogStore()

  try {
    const { measurements, ruleEngine } = snapshotMeasurements()
    const conditionKey = profile.getCurrentConditionKey()
    const baseline = profile.getActiveBaseline()
    const deviation = profile.computeDeviation(measurements)
    const historySummary = log.getHistorySummaryText()
    const { systemPrompt, userPrompt } = buildPrompt(
      profile.staticProfile,
      baseline,
      deviation,
      measurements,
      ruleEngine,
      historySummary,
    )

    // Always create the event so the rule-engine snapshot is logged even when
    // the LLM is not configured.
    const event = log.createEvent(
      trigger,
      conditionKey,
      measurements,
      ruleEngine,
      relatedAlarmEventId,
    )

    if (!profile.aiConfig.enabled) {
      streamBuffer.value = previewFromPrompt(systemPrompt, userPrompt)
      lastError.value = 'AI 未启用 — 显示提示词预览'
      log.markAiError(event.id)
      return event
    }

    const apiKey = await profile.getApiKeyPlaintext()
    if (!apiKey) {
      streamBuffer.value = previewFromPrompt(systemPrompt, userPrompt)
      lastError.value = 'API Key 未配置 — 显示提示词预览'
      log.markAiError(event.id)
      return event
    }

    if (profile.isOverBudget(0.05) && trigger !== 'manual') {
      lastError.value = '月度预算已达上限'
      log.markAiError(event.id)
      return event
    }

    const { content, inputTokens, outputTokens } = await callClaude(
      apiKey,
      profile.aiConfig.model,
      systemPrompt,
      userPrompt,
      (partial) => {
        streamBuffer.value = partial
      },
    )
    const result = parseResult(content, profile.aiConfig.model, inputTokens, outputTokens)
    profile.addSpend(result.costUsd)
    log.patchAiResult(event.id, result)
    return event
  } catch (err) {
    lastError.value = err instanceof Error ? err.message : String(err)
    return null
  } finally {
    isRunning.value = false
  }
}

// ── Compression: called from `hmas-compress-log` event handler ──────────────
export async function compressHistory(
  events: DiagnosticEvent[],
  previousSummary: string | null,
): Promise<void> {
  const profile = useDeviceProfileStore()
  const log = useDiagnosticLogStore()

  if (!profile.aiConfig.enabled || events.length === 0) {
    log.abortCompression()
    return
  }
  const apiKey = await profile.getApiKeyPlaintext()
  if (!apiKey) {
    log.abortCompression()
    return
  }

  const systemPrompt = [
    '你是一名设备运维档案专员。把若干次诊断记录压缩为一段不超过 300 字的中文摘要，',
    '聚焦"反复出现的问题、维修措施、效果变化"。不要逐条列出，只输出最终摘要文本。',
  ].join('\n')

  const eventLines = events.map((ev) => {
    const ai = ev.aiDiagnosis
    const oc = ev.outcome
    return [
      `[${ev.timestamp.slice(0, 10)}] 工况:${ev.conditionKey ?? 'N/A'}`,
      ai ? `AI:${ai.fault_type}/${ai.severity}/${ai.confidence}` : 'AI:无',
      oc
        ? `实际:${oc.actualFinding}; 措施:${oc.actionTaken.join(',')}; 准确性:${oc.diagnosisAccuracy}`
        : '实际:无',
    ].join(' | ')
  })

  const userPrompt = [
    previousSummary ? `已有摘要:\n${previousSummary}\n` : '',
    '新增记录:',
    ...eventLines,
    '',
    '请输出更新后的整体摘要。',
  ].join('\n')

  try {
    const { content, inputTokens, outputTokens } = await callClaude(
      apiKey,
      profile.aiConfig.model,
      systemPrompt,
      userPrompt,
      () => {
        /* no streaming UI for compression */
      },
    )
    const cost = estimateCostUsd(profile.aiConfig.model, inputTokens, outputTokens)
    profile.addSpend(cost)
    log.patchCompression(
      content.trim(),
      events.map((e) => e.id),
    )
  } catch {
    log.abortCompression()
  }
}

/**
 * Test API connection with a minimal "Reply OK" prompt.
 * Returns true on success.
 */
export async function testConnection(apiKey: string, model: string): Promise<boolean> {
  try {
    const resp = await fetch(ANTHROPIC_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model,
        max_tokens: 8,
        messages: [{ role: 'user', content: 'Reply OK' }],
      }),
    })
    return resp.ok
  } catch {
    return false
  }
}

// ── Vue composable wrapper (no lifecycle hooks — listener lives in App.vue) ─
export function useAIDiagnosis() {
  return {
    isRunning,
    streamBuffer,
    lastError,
    runDiagnosis,
    compressHistory,
    testConnection,
  }
}

// Convenience export: the same `Detail` shape the listener expects.
export type { CompressLogEventDetail }

// Auto-trigger entry for alarms.ts (no Vue setup context required)
export function triggerOnAlarm(alarmEventId: string) {
  // Fire-and-forget; errors are surfaced via lastError.
  void runDiagnosis('alarm', alarmEventId)
}
