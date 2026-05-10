// ── Operating condition classification ──────────────────────────────────────
export type RpmBucket = 'LOW' | 'MID' | 'HIGH' // <600 / 600-1200 / >1200 rpm
export type LoadBucket = 'LIGHT' | 'NOMINAL' | 'HEAVY' // <40% / 40-80% / >80% rated pressure
export type ConditionKey = `${RpmBucket}_${LoadBucket}`

export const CONDITION_KEYS: ConditionKey[] = [
  'LOW_LIGHT',
  'LOW_NOMINAL',
  'LOW_HEAVY',
  'MID_LIGHT',
  'MID_NOMINAL',
  'MID_HEAVY',
  'HIGH_LIGHT',
  'HIGH_NOMINAL',
  'HIGH_HEAVY',
]

// ── Bearing entry in static metadata ────────────────────────────────────────
export interface DeviceBearingSpec {
  position: string
  modelNumber: string
  ballDiamMm: number
  pitchDiamMm: number
  ballCount: number
  contactAngleDeg: number
  installedAt?: string
}

// ── Static metadata (Layer 1) ────────────────────────────────────────────────
export interface DeviceStaticProfile {
  deviceId: string
  brand: string
  model: string
  installedAt: string
  ratedRpm: number
  ratedFlowLpm: number
  ratedPressureBar: number
  oilTempMinC: number
  oilTempMaxC: number
  mountingOrientation: string
  environment: string
  notes: string
  bearings: DeviceBearingSpec[]
}

// ── Baseline snapshot (one per condition bucket) ─────────────────────────────
export interface ConditionBaseline {
  conditionKey: ConditionKey
  capturedAt: string
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
  captureCount: number
}

// ── AI configuration ─────────────────────────────────────────────────────────
export interface AIConfig {
  provider: 'anthropic'
  apiKeyEncrypted: string
  model: string
  monthlyBudgetUsd: number
  currentMonthSpendUsd: number
  spendResetMonth: string // "YYYY-MM"
  enabled: boolean
  autoTriggerOnHighAlarm: boolean
}

// ── Deviation report (computed live, not persisted) ──────────────────────────
export interface DeviationReport {
  rmsVsBaselinePct: number
  bpfiVsBaselineDb: number
  bpfoVsBaselineDb: number
  bsfVsBaselineDb: number
  ftfVsBaselineDb: number
  baselineAgeDays: number
}

// ── Root persisted shape ─────────────────────────────────────────────────────
export interface DeviceProfileData {
  static: DeviceStaticProfile
  baselines: Partial<Record<ConditionKey, ConditionBaseline>>
  aiConfig: AIConfig
}

// ── Defaults ─────────────────────────────────────────────────────────────────
export const DEFAULT_STATIC_PROFILE: DeviceStaticProfile = {
  deviceId: '',
  brand: '',
  model: '',
  installedAt: '',
  ratedRpm: 1480,
  ratedFlowLpm: 50,
  ratedPressureBar: 280,
  oilTempMinC: 40,
  oilTempMaxC: 65,
  mountingOrientation: '',
  environment: '',
  notes: '',
  bearings: [],
}

export const DEFAULT_AI_CONFIG: AIConfig = {
  provider: 'anthropic',
  apiKeyEncrypted: '',
  model: 'claude-sonnet-4-6',
  monthlyBudgetUsd: 50,
  currentMonthSpendUsd: 0,
  spendResetMonth: new Date().toISOString().slice(0, 7),
  enabled: false,
  autoTriggerOnHighAlarm: false,
}
