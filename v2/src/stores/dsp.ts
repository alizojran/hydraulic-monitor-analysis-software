import { defineStore } from 'pinia'
import { ref, shallowRef, computed, watch } from 'vue'
import { DEFAULT_FFT_CONFIG } from '@/config/defaults'
import type { FftConfig, FftResult, OctaveBandResult } from '@/types/dsp'
import { computeBearingFrequencies } from '@/dsp/bearing'

const DSP_STORAGE_KEY = 'daq-dsp-config'

export interface BearingPreset {
  name: string
  ballCount: number
  pitchDiamMm: number
  ballDiamMm: number
  contactAngleDeg: number
}

export interface BearingState {
  id: string
  name: string
  preset: string
  params: { ballCount: number; pitchDiamMm: number; ballDiamMm: number; contactAngleDeg: number }
  overlay: boolean
}

export const BEARING_PRESETS: BearingPreset[] = [
  { name: 'SKF 6205',  ballCount: 9,  pitchDiamMm: 39.04, ballDiamMm: 7.94,  contactAngleDeg: 0 },
  { name: 'SKF 6206',  ballCount: 9,  pitchDiamMm: 46.4,  ballDiamMm: 9.53,  contactAngleDeg: 0 },
  { name: 'SKF 6308',  ballCount: 8,  pitchDiamMm: 65.0,  ballDiamMm: 15.08, contactAngleDeg: 0 },
  { name: 'SKF 6310',  ballCount: 8,  pitchDiamMm: 80.0,  ballDiamMm: 19.05, contactAngleDeg: 0 },
  { name: 'NSK 6204',  ballCount: 8,  pitchDiamMm: 33.5,  ballDiamMm: 7.14,  contactAngleDeg: 0 },
  { name: 'FAG 22320', ballCount: 14, pitchDiamMm: 145.0, ballDiamMm: 28.0,  contactAngleDeg: 12 },
]

const DEFAULT_BEARING_PARAMS = { ballCount: 9, pitchDiamMm: 39.04, ballDiamMm: 7.94, contactAngleDeg: 0 }

// Per-bearing color sets (two distinct palettes for DE / NDE)
const BEARING_COLOR_SETS = [
  { BPFI: '#ff8800', BPFO: '#ff3355', BSF: '#00ff95', FTF: '#00d9ff' },
  { BPFI: '#ffcc00', BPFO: '#ff66aa', BSF: '#66ffbb', FTF: '#66eeff' },
]
export function getBearingColorSet(idx: number) {
  return BEARING_COLOR_SETS[idx % BEARING_COLOR_SETS.length]
}

function loadDspConfig() {
  try {
    const v = localStorage.getItem(DSP_STORAGE_KEY)
    if (!v) return {}
    const data = JSON.parse(v)
    // Migrate old single-bearing format to bearings array
    if (!data.bearings && (data.bearingPreset !== undefined || data.bearingParams !== undefined)) {
      data.bearings = [{
        id: 'b0', name: 'DE',
        preset: data.bearingPreset ?? 'SKF 6205',
        params: { ...DEFAULT_BEARING_PARAMS, ...(data.bearingParams ?? {}) },
        overlay: data.bearingOverlay ?? true,
      }]
    }
    return data
  } catch { return {} }
}

export const useDspStore = defineStore('dsp', () => {
  const _saved = loadDspConfig()

  const fftConfig = ref<FftConfig>({ ...DEFAULT_FFT_CONFIG, ...(_saved.fftConfig ?? {}) })
  const selectedChannelId = ref<string>(_saved.selectedChannelId ?? 'V02')
  const fftResult = shallowRef<FftResult | null>(null)
  const octaveBands = shallowRef<OctaveBandResult | null>(null)
  const octaveWeighting = ref<'A' | 'C' | 'none'>(_saved.octaveWeighting ?? 'A')
  const spectrumHistory = shallowRef<Float32Array[]>([])
  const spectrumHistoryTotal = ref(0)
  const maxHistoryCols = 360

  // Envelope demodulation
  const envelopeMode = ref<boolean>(_saved.envelopeMode ?? false)
  function toggleEnvelopeMode() { envelopeMode.value = !envelopeMode.value }
  function setEnvelopeMode(v: boolean) { envelopeMode.value = v }

  // X-axis mode
  const xAxisMode = ref<'hz' | 'order'>(_saved.xAxisMode ?? 'hz')
  function toggleXAxisMode() { xAxisMode.value = xAxisMode.value === 'hz' ? 'order' : 'hz' }
  function setXAxisMode(m: 'hz' | 'order') { xAxisMode.value = m }

  // ─── Multi-bearing state ─────────────────────────────────────────────────
  const bearings = ref<BearingState[]>(_saved.bearings ?? [{
    id: 'b0', name: 'DE', preset: 'SKF 6205',
    params: { ...DEFAULT_BEARING_PARAMS },
    overlay: true,
  }])

  const bearingShaftRpm = ref(1500)   // updated externally from V01

  // All bearing fault frequencies (for overlay and diagnostics panel)
  const allBearingFreqs = computed(() =>
    bearings.value.map((b, idx) => ({
      id: b.id,
      name: b.name,
      overlay: b.overlay,
      colorSet: getBearingColorSet(idx),
      freqs: computeBearingFrequencies({ rpmHz: bearingShaftRpm.value / 60, ...b.params }),
    }))
  )

  // Backward-compat single-bearing accessors (point to bearings[0])
  const bearingPreset = computed(() => bearings.value[0]?.preset ?? 'SKF 6205')
  const bearingParams = computed(() => bearings.value[0]?.params ?? DEFAULT_BEARING_PARAMS)
  const bearingOverlay = computed(() => bearings.value[0]?.overlay ?? true)
  const bearingFreqs = computed(() => allBearingFreqs.value[0]?.freqs ?? { bpfi: 0, bpfo: 0, bsf: 0, ftf: 0 })

  function setBearingPreset(name: string, idx = 0) {
    if (!bearings.value[idx]) return
    bearings.value[idx].preset = name
    if (name !== 'Custom') {
      const p = BEARING_PRESETS.find(b => b.name === name)
      if (p) {
        bearings.value[idx].params = {
          ballCount: p.ballCount,
          pitchDiamMm: p.pitchDiamMm,
          ballDiamMm: p.ballDiamMm,
          contactAngleDeg: p.contactAngleDeg,
        }
      }
    }
  }

  function updateBearingParams(partial: Partial<BearingState['params']>, idx = 0) {
    if (!bearings.value[idx]) return
    bearings.value[idx].params = { ...bearings.value[idx].params, ...partial }
    bearings.value[idx].preset = 'Custom'
  }

  function setBearingShaftRpm(rpm: number) { bearingShaftRpm.value = rpm }

  function toggleBearingOverlay(idx = 0) {
    if (!bearings.value[idx]) return
    bearings.value[idx].overlay = !bearings.value[idx].overlay
  }

  function setBearingName(name: string, idx = 0) {
    if (!bearings.value[idx]) return
    bearings.value[idx].name = name
  }

  function addBearing() {
    const idx = bearings.value.length
    bearings.value.push({
      id: `b${Date.now()}`,
      name: idx === 1 ? 'NDE' : `BRG${idx + 1}`,
      preset: 'SKF 6205',
      params: { ...DEFAULT_BEARING_PARAMS },
      overlay: true,
    })
  }

  function removeBearing(idx: number) {
    if (bearings.value.length <= 1) return
    bearings.value.splice(idx, 1)
  }

  // ─── Gear mesh / sidebands ───────────────────────────────────────────────
  const gearTeeth = ref<number>(_saved.gearTeeth ?? 0)
  const gearOverlay = ref<boolean>(_saved.gearOverlay ?? false)
  const gearFreqs = computed(() => {
    if (gearTeeth.value <= 0) return { mesh: 0, sb1: 0, sb2: 0 }
    const shaftHz = bearingShaftRpm.value / 60
    const mesh = gearTeeth.value * shaftHz
    return { mesh, sb1: mesh - shaftHz, sb2: mesh + shaftHz }
  })
  function setGearTeeth(z: number) { gearTeeth.value = Math.max(0, Math.floor(z)) }
  function toggleGearOverlay() { gearOverlay.value = !gearOverlay.value }

  // ─── Debounced persistence ───────────────────────────────────────────────
  let _saveTimer: ReturnType<typeof setTimeout> | null = null
  function _scheduleSave() {
    if (_saveTimer) clearTimeout(_saveTimer)
    _saveTimer = setTimeout(() => {
      try {
        localStorage.setItem(DSP_STORAGE_KEY, JSON.stringify({
          fftConfig: fftConfig.value,
          selectedChannelId: selectedChannelId.value,
          octaveWeighting: octaveWeighting.value,
          envelopeMode: envelopeMode.value,
          xAxisMode: xAxisMode.value,
          bearings: bearings.value,
          gearTeeth: gearTeeth.value,
          gearOverlay: gearOverlay.value,
        }))
      } catch { /* storage full */ }
    }, 300)
  }

  watch(
    [fftConfig, octaveWeighting, envelopeMode, xAxisMode, bearings, gearTeeth, gearOverlay, selectedChannelId],
    _scheduleSave,
    { deep: true }
  )

  // ─── FFT worker ──────────────────────────────────────────────────────────
  let worker: Worker | null = null
  let requestId = 0
  let pendingRequest = false
  let pendingTimer: ReturnType<typeof setTimeout> | null = null

  function initWorker() {
    if (worker) return
    try {
      worker = new Worker(new URL('../workers/fft.worker.ts', import.meta.url), { type: 'module' })
    } catch (err) {
      console.error('[dsp] worker construction failed:', err)
      return
    }
    worker.onmessage = (e) => {
      if (e.data.type === 'result') {
        pendingRequest = false
        if (pendingTimer) { clearTimeout(pendingTimer); pendingTimer = null }
        fftResult.value = e.data.result
        const mag = e.data.result.magnitudeDb as Float32Array
        const col = new Float32Array(mag.length)
        for (let i = 0; i < mag.length; i++) col[i] = Math.max(0, Math.min(1, (mag[i] + 120) / 120))
        const hist = [...spectrumHistory.value, col]
        if (hist.length > maxHistoryCols) hist.shift()
        spectrumHistory.value = hist
        spectrumHistoryTotal.value++
      } else if (e.data.type === 'error') {
        console.error('[dsp] worker error:', e.data.error)
        pendingRequest = false
        if (pendingTimer) { clearTimeout(pendingTimer); pendingTimer = null }
      }
    }
    worker.onerror = (ev) => {
      console.error('[dsp] worker onerror:', ev.message || ev)
      pendingRequest = false
      if (pendingTimer) { clearTimeout(pendingTimer); pendingTimer = null }
    }
  }

  function requestFft(samples: Float32Array, channelId: string) {
    if (pendingRequest) return
    initWorker()
    if (!worker) return
    pendingRequest = true
    pendingTimer = setTimeout(() => {
      console.warn('[dsp] worker request timed out')
      pendingRequest = false
      pendingTimer = null
    }, 1000)
    const id = ++requestId
    const copy = samples.slice()
    const cfg = { ...fftConfig.value }
    worker.postMessage({ type: 'compute', samples: copy, config: cfg, channelId, requestId: id, envelope: envelopeMode.value }, [copy.buffer])
  }

  function setFftConfig(partial: Partial<FftConfig>) {
    fftConfig.value = { ...fftConfig.value, ...partial }
  }

  function setSelectedChannel(id: string) {
    selectedChannelId.value = id
    fftResult.value = null
    spectrumHistory.value = []
    spectrumHistoryTotal.value = 0
  }

  function setOctaveBands(result: OctaveBandResult) { octaveBands.value = result }
  function setOctaveWeighting(w: 'A' | 'C' | 'none') { octaveWeighting.value = w }

  function destroyWorker() {
    worker?.terminate()
    worker = null
  }

  return {
    // FFT / spectrum
    fftConfig, selectedChannelId, fftResult, octaveBands, octaveWeighting,
    spectrumHistory, spectrumHistoryTotal,
    requestFft, setFftConfig, setSelectedChannel, setOctaveBands, setOctaveWeighting, destroyWorker,
    // Envelope / axis
    envelopeMode, toggleEnvelopeMode, setEnvelopeMode,
    xAxisMode, toggleXAxisMode, setXAxisMode,
    // Multi-bearing
    bearings, allBearingFreqs, addBearing, removeBearing, setBearingName,
    bearingShaftRpm, setBearingShaftRpm,
    // Backward-compat single-bearing
    bearingPreset, bearingParams, bearingOverlay, bearingFreqs,
    setBearingPreset, updateBearingParams, toggleBearingOverlay,
    // Gear
    gearTeeth, gearOverlay, gearFreqs, setGearTeeth, toggleGearOverlay,
  }
})
