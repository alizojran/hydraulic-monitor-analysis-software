import { defineStore } from 'pinia'
import { ref, watch } from 'vue'
import type {
  ConditionBaseline,
  ConditionKey,
  DeviceProfileData,
  DeviceStaticProfile,
  AIConfig,
  RpmBucket,
  LoadBucket,
  DeviationReport,
} from '@/types/deviceProfile'
import { DEFAULT_STATIC_PROFILE, DEFAULT_AI_CONFIG, CONDITION_KEYS } from '@/types/deviceProfile'
import type { DiagnosisMeasurements } from '@/types/diagnostic'
import { loadPersisted, savePersisted } from '@/utils/persistedStore'
import { useDspComputeStore } from './dspCompute'
import { useAcquisitionStore } from './acquisition'
import { useBearingModelStore } from './bearingModel'
import { computeBearingFrequencies } from '@/dsp/bearing'

const PROFILE_KEY = 'hmas-device-profile'
const PROFILE_VERSION = 1

const SAVE_DEBOUNCE_MS = 400
const BASELINE_CAPTURE_DURATION_MS = 60_000
const BASELINE_SAMPLE_INTERVAL_MS = 2_000

function classifyCondition(
  rpmActual: number,
  pressureBar: number,
  ratedPressure: number,
): ConditionKey {
  const rpm: RpmBucket = rpmActual < 600 ? 'LOW' : rpmActual < 1200 ? 'MID' : 'HIGH'
  const pct = ratedPressure > 0 ? pressureBar / ratedPressure : 0
  const load: LoadBucket = pct < 0.4 ? 'LIGHT' : pct < 0.8 ? 'NOMINAL' : 'HEAVY'
  return `${rpm}_${load}`
}

// ── AES-GCM helpers (per-origin key via PBKDF2) ──────────────────────────────
async function deriveKey(): Promise<CryptoKey> {
  const enc = new TextEncoder()
  const salt = enc.encode('hmas-device-profile-v1')
  const passphrase = enc.encode(window.location.origin + '|hmas-byok')
  const baseKey = await window.crypto.subtle.importKey(
    'raw',
    passphrase,
    { name: 'PBKDF2' },
    false,
    ['deriveKey'],
  )
  return window.crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: 100_000, hash: 'SHA-256' },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  )
}

function bytesToBase64(bytes: Uint8Array): string {
  let s = ''
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i])
  return btoa(s)
}

function base64ToBytes(b64: string): Uint8Array {
  const s = atob(b64)
  const bytes = new Uint8Array(s.length)
  for (let i = 0; i < s.length; i++) bytes[i] = s.charCodeAt(i)
  return bytes
}

async function encryptString(plaintext: string): Promise<string> {
  if (!plaintext) return ''
  const key = await deriveKey()
  const iv = window.crypto.getRandomValues(new Uint8Array(12))
  const ct = new Uint8Array(
    await window.crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      key,
      new TextEncoder().encode(plaintext),
    ),
  )
  const out = new Uint8Array(iv.length + ct.length)
  out.set(iv, 0)
  out.set(ct, iv.length)
  return bytesToBase64(out)
}

async function decryptString(ciphertext: string): Promise<string> {
  if (!ciphertext) return ''
  try {
    const bytes = base64ToBytes(ciphertext)
    const iv = bytes.slice(0, 12)
    const ct = bytes.slice(12)
    const key = await deriveKey()
    const pt = await window.crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ct)
    return new TextDecoder().decode(pt)
  } catch {
    return ''
  }
}

// ── DB amplitude lookup at a given frequency from FFT spectrum ───────────────
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

export const useDeviceProfileStore = defineStore('deviceProfile', () => {
  const saved = loadPersisted<DeviceProfileData>({
    key: PROFILE_KEY,
    version: PROFILE_VERSION,
  })

  const staticProfile = ref<DeviceStaticProfile>({
    ...DEFAULT_STATIC_PROFILE,
    ...(saved?.static ?? {}),
    bearings: saved?.static?.bearings ?? [],
  })
  const baselines = ref<Partial<Record<ConditionKey, ConditionBaseline>>>(saved?.baselines ?? {})
  const aiConfig = ref<AIConfig>({ ...DEFAULT_AI_CONFIG, ...(saved?.aiConfig ?? {}) })

  const captureInProgress = ref(false)
  const captureProgress = ref(0)
  const captureCondition = ref<ConditionKey | null>(null)

  let saveTimer: ReturnType<typeof setTimeout> | null = null
  function _save() {
    if (saveTimer) clearTimeout(saveTimer)
    saveTimer = setTimeout(() => {
      const data: DeviceProfileData = {
        static: staticProfile.value,
        baselines: baselines.value,
        aiConfig: aiConfig.value,
      }
      savePersisted({ key: PROFILE_KEY, version: PROFILE_VERSION }, data)
    }, SAVE_DEBOUNCE_MS)
  }

  watch([staticProfile, baselines, aiConfig], _save, { deep: true })

  // Reset monthly spend on month change
  function _checkMonthlyReset() {
    const nowMonth = new Date().toISOString().slice(0, 7)
    if (aiConfig.value.spendResetMonth !== nowMonth) {
      aiConfig.value.currentMonthSpendUsd = 0
      aiConfig.value.spendResetMonth = nowMonth
    }
  }
  _checkMonthlyReset()

  function getCurrentConditionKey(): ConditionKey | null {
    const acq = useAcquisitionStore()
    const rpm = acq.channelValues['V01'] ?? 0
    const pressure = acq.channelValues['CH01'] ?? 0
    const rated = staticProfile.value.ratedPressureBar
    if (rpm <= 0 || rated <= 0) return null
    return classifyCondition(rpm, pressure, rated)
  }

  function getActiveBaseline(): ConditionBaseline | null {
    const key = getCurrentConditionKey()
    if (!key) return null
    return baselines.value[key] ?? null
  }

  function getBaseline(key: ConditionKey): ConditionBaseline | null {
    return baselines.value[key] ?? null
  }

  function deleteBaseline(key: ConditionKey) {
    delete baselines.value[key]
    baselines.value = { ...baselines.value }
  }

  function _readSnapshotForBearings(): {
    bpfiDb: number
    bpfoDb: number
    bsfDb: number
    ftfDb: number
  } {
    const dsp = useDspComputeStore()
    const bearingModel = useBearingModelStore()
    const fft = dsp.fftResult
    const acq = useAcquisitionStore()
    const rpm = acq.channelValues['V01'] ?? 0
    const bearing = bearingModel.bearings[0]
    if (!fft || !bearing || rpm <= 0) {
      return { bpfiDb: -120, bpfoDb: -120, bsfDb: -120, ftfDb: -120 }
    }
    const geo = computeBearingFrequencies({ ...bearing.params, rpmHz: rpm / 60 })
    return {
      bpfiDb: ampDbAt(fft.magnitudeDb, fft.frequencies, geo.bpfi),
      bpfoDb: ampDbAt(fft.magnitudeDb, fft.frequencies, geo.bpfo),
      bsfDb: ampDbAt(fft.magnitudeDb, fft.frequencies, geo.bsf),
      ftfDb: ampDbAt(fft.magnitudeDb, fft.frequencies, geo.ftf),
    }
  }

  // ── Baseline capture: average measurements over 60 s ────────────────────────
  async function startBaselineCapture(key: ConditionKey): Promise<void> {
    if (captureInProgress.value) return
    captureInProgress.value = true
    captureCondition.value = key
    captureProgress.value = 0

    const samples: Array<{
      rpm: number
      pressure: number
      oilTemp: number
      rmsG: number
      peakG: number
      crestFactor: number
      bpfiDb: number
      bpfoDb: number
      bsfDb: number
      ftfDb: number
      pressurePulsationRms: number
    }> = []

    const start = Date.now()
    const dsp = useDspComputeStore()
    const acq = useAcquisitionStore()

    function takeSample() {
      const fft = dsp.fftResult
      if (!fft) return
      const bearings = _readSnapshotForBearings()
      samples.push({
        rpm: acq.channelValues['V01'] ?? 0,
        pressure: acq.channelValues['CH01'] ?? 0,
        oilTemp: acq.channelValues['CH05'] ?? acq.channelValues['CH06'] ?? 0,
        rmsG: fft.rms,
        peakG: fft.peakValue,
        crestFactor: fft.crestFactor,
        bpfiDb: bearings.bpfiDb,
        bpfoDb: bearings.bpfoDb,
        bsfDb: bearings.bsfDb,
        ftfDb: bearings.ftfDb,
        pressurePulsationRms: 0, // not yet computed; reserve for future
      })
    }

    return new Promise<void>((resolve) => {
      const tick = setInterval(() => {
        takeSample()
        const elapsed = Date.now() - start
        captureProgress.value = Math.min(
          100,
          Math.round((elapsed / BASELINE_CAPTURE_DURATION_MS) * 100),
        )
        if (elapsed >= BASELINE_CAPTURE_DURATION_MS) {
          clearInterval(tick)
          finalize()
        }
      }, BASELINE_SAMPLE_INTERVAL_MS)

      function finalize() {
        if (samples.length === 0) {
          captureInProgress.value = false
          captureCondition.value = null
          captureProgress.value = 0
          resolve()
          return
        }
        const avg = (sel: (s: (typeof samples)[number]) => number) =>
          samples.reduce((a, s) => a + sel(s), 0) / samples.length
        const baseline: ConditionBaseline = {
          conditionKey: key,
          capturedAt: new Date().toISOString(),
          rpmActual: avg((s) => s.rpm),
          pressureBar: avg((s) => s.pressure),
          oilTempC: avg((s) => s.oilTemp),
          rmsG: avg((s) => s.rmsG),
          peakG: avg((s) => s.peakG),
          crestFactor: avg((s) => s.crestFactor),
          bpfiAmplitudeDb: avg((s) => s.bpfiDb),
          bpfoAmplitudeDb: avg((s) => s.bpfoDb),
          bsfAmplitudeDb: avg((s) => s.bsfDb),
          ftfAmplitudeDb: avg((s) => s.ftfDb),
          pressurePulsationRmsBar: avg((s) => s.pressurePulsationRms),
          note: '',
          captureCount: samples.length,
        }
        baselines.value = { ...baselines.value, [key]: baseline }
        captureInProgress.value = false
        captureCondition.value = null
        captureProgress.value = 0
        resolve()
      }
    })
  }

  function computeDeviation(measurements: DiagnosisMeasurements): DeviationReport | null {
    const baseline = getActiveBaseline()
    if (!baseline) return null
    const ageDays = (Date.now() - new Date(baseline.capturedAt).getTime()) / 86_400_000
    const rmsPct =
      baseline.rmsG > 0 ? ((measurements.rmsG - baseline.rmsG) / baseline.rmsG) * 100 : 0
    return {
      rmsVsBaselinePct: rmsPct,
      bpfiVsBaselineDb: measurements.bpfiAmplitudeDb - baseline.bpfiAmplitudeDb,
      bpfoVsBaselineDb: measurements.bpfoAmplitudeDb - baseline.bpfoAmplitudeDb,
      bsfVsBaselineDb: measurements.bsfAmplitudeDb - baseline.bsfAmplitudeDb,
      ftfVsBaselineDb: measurements.ftfAmplitudeDb - baseline.ftfAmplitudeDb,
      baselineAgeDays: ageDays,
    }
  }

  // ── API key encryption helpers ──────────────────────────────────────────────
  async function setApiKey(plaintext: string): Promise<void> {
    aiConfig.value.apiKeyEncrypted = plaintext ? await encryptString(plaintext) : ''
  }

  async function getApiKeyPlaintext(): Promise<string> {
    if (!aiConfig.value.apiKeyEncrypted) return ''
    return decryptString(aiConfig.value.apiKeyEncrypted)
  }

  // ── Spend tracking ──────────────────────────────────────────────────────────
  function addSpend(usd: number) {
    _checkMonthlyReset()
    aiConfig.value.currentMonthSpendUsd += usd
  }

  function isOverBudget(estimatedUsd: number): boolean {
    _checkMonthlyReset()
    return aiConfig.value.currentMonthSpendUsd + estimatedUsd > aiConfig.value.monthlyBudgetUsd
  }

  // ── Import / Export ─────────────────────────────────────────────────────────
  function exportProfile(): string {
    const data: DeviceProfileData = {
      static: staticProfile.value,
      baselines: baselines.value,
      aiConfig: { ...aiConfig.value, apiKeyEncrypted: '' }, // never export key
    }
    return JSON.stringify(data, null, 2)
  }

  function importProfile(json: string) {
    const parsed = JSON.parse(json) as Partial<DeviceProfileData>
    if (parsed.static) staticProfile.value = { ...DEFAULT_STATIC_PROFILE, ...parsed.static }
    if (parsed.baselines) baselines.value = parsed.baselines
    if (parsed.aiConfig)
      aiConfig.value = {
        ...DEFAULT_AI_CONFIG,
        ...parsed.aiConfig,
        apiKeyEncrypted: aiConfig.value.apiKeyEncrypted, // preserve existing key
      }
  }

  return {
    staticProfile,
    baselines,
    aiConfig,
    captureInProgress,
    captureProgress,
    captureCondition,
    CONDITION_KEYS,
    getCurrentConditionKey,
    getActiveBaseline,
    getBaseline,
    deleteBaseline,
    startBaselineCapture,
    computeDeviation,
    setApiKey,
    getApiKeyPlaintext,
    addSpend,
    isOverBudget,
    exportProfile,
    importProfile,
  }
})
