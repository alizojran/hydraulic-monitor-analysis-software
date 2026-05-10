import { defineStore } from 'pinia'
import { ref, watch } from 'vue'
import type {
  AIDiagnosisResult,
  CompressLogEventDetail,
  DiagnosisMeasurements,
  DiagnosisTrigger,
  DiagnosticEvent,
  DiagnosticLogData,
  DiagnosticOutcome,
  RuleEngineSummary,
} from '@/types/diagnostic'
import type { ConditionKey } from '@/types/deviceProfile'
import { loadPersisted, savePersisted } from '@/utils/persistedStore'

const LOG_KEY = 'hmas-diagnostic-log'
const LOG_VERSION = 1
const SAVE_DEBOUNCE_MS = 400
const RAW_EVENT_CAP = 20

function newId(): string {
  const d = new Date()
  const stamp = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  const rand = Math.random().toString(36).slice(2, 6)
  return `evt-${stamp}-${rand}`
}

export const useDiagnosticLogStore = defineStore('diagnosticLog', () => {
  const saved = loadPersisted<DiagnosticLogData>({ key: LOG_KEY, version: LOG_VERSION })

  const events = ref<DiagnosticEvent[]>(saved?.events ?? [])
  const compressedSummary = ref<string | null>(saved?.compressedSummary ?? null)
  const summaryGeneratedAt = ref<string | null>(saved?.summaryGeneratedAt ?? null)
  const summaryCoversEventIds = ref<string[]>(saved?.summaryCoversEventIds ?? [])
  const totalEventsEver = ref<number>(saved?.totalEventsEver ?? 0)
  const compressionInProgress = ref(false)

  let saveTimer: ReturnType<typeof setTimeout> | null = null
  function _save() {
    if (saveTimer) clearTimeout(saveTimer)
    saveTimer = setTimeout(() => {
      const data: DiagnosticLogData = {
        events: events.value,
        compressedSummary: compressedSummary.value,
        summaryGeneratedAt: summaryGeneratedAt.value,
        summaryCoversEventIds: summaryCoversEventIds.value,
        totalEventsEver: totalEventsEver.value,
      }
      savePersisted({ key: LOG_KEY, version: LOG_VERSION }, data)
    }, SAVE_DEBOUNCE_MS)
  }

  watch(
    [events, compressedSummary, summaryGeneratedAt, summaryCoversEventIds, totalEventsEver],
    _save,
    { deep: true },
  )

  function createEvent(
    trigger: DiagnosisTrigger,
    conditionKey: ConditionKey | null,
    measurements: DiagnosisMeasurements,
    ruleEngine: RuleEngineSummary,
    relatedAlarmEventId?: string,
  ): DiagnosticEvent {
    const event: DiagnosticEvent = {
      id: newId(),
      timestamp: new Date().toISOString(),
      trigger,
      relatedAlarmEventId,
      conditionKey,
      measurements,
      ruleEngine,
      aiDiagnosis: null,
      outcome: null,
      status: 'pending_ai',
    }
    events.value.push(event)
    totalEventsEver.value += 1
    _maybeCompress()
    return event
  }

  function patchAiResult(eventId: string, result: AIDiagnosisResult): void {
    const ev = events.value.find((e) => e.id === eventId)
    if (!ev) return
    ev.aiDiagnosis = result
    ev.status = 'awaiting_feedback'
  }

  function markAiError(eventId: string): void {
    const ev = events.value.find((e) => e.id === eventId)
    if (!ev) return
    ev.status = 'ai_error'
  }

  function recordOutcome(eventId: string, outcome: DiagnosticOutcome): void {
    const ev = events.value.find((e) => e.id === eventId)
    if (!ev) return
    ev.outcome = outcome
    ev.status = 'complete'
  }

  function patchCompression(summaryText: string, coveredIds: string[]): void {
    compressedSummary.value = summaryText
    summaryGeneratedAt.value = new Date().toISOString()
    summaryCoversEventIds.value = coveredIds
    // Drop the compressed events from the raw list
    events.value = events.value.filter((e) => !coveredIds.includes(e.id))
    compressionInProgress.value = false
  }

  function abortCompression(): void {
    compressionInProgress.value = false
  }

  /**
   * When raw events exceed RAW_EVENT_CAP, dispatch a custom event for
   * an external listener (App.vue → useAIDiagnosis) to generate a summary.
   * The store does NOT import the composable, breaking the cycle.
   */
  function _maybeCompress(): void {
    if (events.value.length <= RAW_EVENT_CAP) return
    if (compressionInProgress.value) return
    compressionInProgress.value = true
    // Pick the oldest events to compress, keep the most recent few uncompressed.
    const KEEP_RECENT = 5
    const toCompress = events.value.slice(0, events.value.length - KEEP_RECENT)
    const detail: CompressLogEventDetail = {
      events: toCompress,
      previousSummary: compressedSummary.value,
    }
    window.dispatchEvent(new CustomEvent('hmas-compress-log', { detail }))
  }

  /**
   * Returns the text injected into every diagnosis prompt under
   * "设备历史摘要 / Device History Summary".
   */
  function getHistorySummaryText(): string {
    const lines: string[] = []
    if (compressedSummary.value) {
      lines.push(compressedSummary.value)
    }
    // Include up to 5 most-recent uncompressed events as bullet points
    const recent = events.value.slice(-5)
    for (const ev of recent) {
      const date = ev.timestamp.slice(0, 10)
      const ai = ev.aiDiagnosis
      const oc = ev.outcome
      const aiPart = ai
        ? `${ai.fault_type} (${ai.severity}, conf=${ai.confidence})`
        : 'no AI result'
      const outcomePart = oc
        ? ` → 实际:${oc.actualFinding}; 措施:${oc.actionTaken.join(',')}; 准确性:${oc.diagnosisAccuracy}`
        : ''
      lines.push(`- ${date} ${aiPart}${outcomePart}`)
    }
    return lines.join('\n')
  }

  function getEventByAlarmId(alarmEventId: string): DiagnosticEvent | null {
    for (let i = events.value.length - 1; i >= 0; i--) {
      if (events.value[i].relatedAlarmEventId === alarmEventId) return events.value[i]
    }
    return null
  }

  function clearAll() {
    events.value = []
    compressedSummary.value = null
    summaryGeneratedAt.value = null
    summaryCoversEventIds.value = []
    totalEventsEver.value = 0
  }

  return {
    events,
    compressedSummary,
    summaryGeneratedAt,
    summaryCoversEventIds,
    totalEventsEver,
    compressionInProgress,
    createEvent,
    patchAiResult,
    markAiError,
    recordOutcome,
    patchCompression,
    abortCompression,
    getHistorySummaryText,
    getEventByAlarmId,
    clearAll,
  }
})
