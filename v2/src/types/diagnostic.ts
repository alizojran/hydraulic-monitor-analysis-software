import type { ConditionKey } from './deviceProfile'

export type DiagnosisTrigger = 'manual' | 'alarm' | 'scheduled'
export type DiagnosisConfidence = 'high' | 'medium' | 'low'
export type DiagnosisSeverity = 'critical' | 'warning' | 'advisory' | 'normal'
export type FeedbackAccuracy = 'correct' | 'incorrect' | 'unchecked'
export type DiagnosticStatus = 'pending_ai' | 'awaiting_feedback' | 'complete' | 'ai_error'

export interface DiagnosisMeasurements {
  rmsG: number
  rmsVsBaselinePct: number | null
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
  rmsTrend7d: number[] | null
}

// Lightweight rule engine summary — duplicates the small subset we need
// to avoid pulling the full faultClassifier types into persistence shape.
export interface RuleEngineFinding {
  faultType: 'BPFO' | 'BPFI' | 'BSF' | 'FTF'
  severity: string
  snrDb: number
}

export interface RuleEngineSummary {
  overallSeverity: string
  findings: RuleEngineFinding[]
}

export interface AIDiagnosisResult {
  fault_type: string
  severity: DiagnosisSeverity
  confidence: DiagnosisConfidence
  evidence: string[]
  recommendation: string
  recheck_interval_days: number | null
  stop_machine: boolean
  explanation: string
  // Meta added by app layer (not from LLM)
  model: string
  promptTokens: number
  completionTokens: number
  costUsd: number
  generatedAt: string
  rawJson: string
}

export interface DiagnosticOutcome {
  recordedAt: string
  inspectionDate: string
  actualFinding: string
  diagnosisAccuracy: FeedbackAccuracy
  actionTaken: string[]
  partsReplaced: string
  postActionRmsG: number | null
  newBaselineEstablished: boolean
  notes: string
}

export interface DiagnosticEvent {
  id: string
  timestamp: string
  trigger: DiagnosisTrigger
  relatedAlarmEventId?: string
  conditionKey: ConditionKey | null
  measurements: DiagnosisMeasurements
  ruleEngine: RuleEngineSummary
  aiDiagnosis: AIDiagnosisResult | null
  outcome: DiagnosticOutcome | null
  status: DiagnosticStatus
}

export interface DiagnosticLogData {
  events: DiagnosticEvent[] // capped at 20 raw entries
  compressedSummary: string | null
  summaryGeneratedAt: string | null
  summaryCoversEventIds: string[]
  totalEventsEver: number
}

// Detail payload for the `hmas-compress-log` custom event.
export interface CompressLogEventDetail {
  events: DiagnosticEvent[]
  previousSummary: string | null
}
