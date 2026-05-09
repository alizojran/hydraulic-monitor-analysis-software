import { defineStore } from 'pinia'
import { ref, shallowRef, computed } from 'vue'
import { DEFAULT_FFT_CONFIG } from '@/config/defaults'
import type { FftConfig, FftResult, OctaveBandResult, BearingParams } from '@/types/dsp'
import { computeBearingFrequencies } from '@/dsp/bearing'

export interface BearingPreset {
  name: string
  ballCount: number
  pitchDiamMm: number
  ballDiamMm: number
  contactAngleDeg: number
}

export const BEARING_PRESETS: BearingPreset[] = [
  { name: 'SKF 6205',  ballCount: 9, pitchDiamMm: 39.04, ballDiamMm: 7.94,  contactAngleDeg: 0 },
  { name: 'SKF 6206',  ballCount: 9, pitchDiamMm: 46.4,  ballDiamMm: 9.53,  contactAngleDeg: 0 },
  { name: 'SKF 6308',  ballCount: 8, pitchDiamMm: 65.0,  ballDiamMm: 15.08, contactAngleDeg: 0 },
  { name: 'SKF 6310',  ballCount: 8, pitchDiamMm: 80.0,  ballDiamMm: 19.05, contactAngleDeg: 0 },
  { name: 'NSK 6204',  ballCount: 8, pitchDiamMm: 33.5,  ballDiamMm: 7.14,  contactAngleDeg: 0 },
  { name: 'FAG 22320', ballCount: 14,pitchDiamMm: 145.0, ballDiamMm: 28.0,  contactAngleDeg: 12 },
]

export const useDspStore = defineStore('dsp', () => {
  const fftConfig = ref<FftConfig>({ ...DEFAULT_FFT_CONFIG })
  const selectedChannelId = ref('V02')
  const fftResult = shallowRef<FftResult | null>(null)
  const octaveBands = shallowRef<OctaveBandResult | null>(null)
  const octaveWeighting = ref<'A' | 'C' | 'none'>('A')
  const spectrumHistory = shallowRef<Float32Array[]>([])
  const spectrumHistoryTotal = ref(0)
  const maxHistoryCols = 360

  // Bearing diagnostic state
  const bearingPreset = ref<string>('SKF 6205')
  const bearingParams = ref<Omit<BearingParams, 'rpmHz'>>({
    ballCount: 9,
    pitchDiamMm: 39.04,
    ballDiamMm: 7.94,
    contactAngleDeg: 0,
  })
  const bearingShaftRpm = ref(1500)   // updated externally from V01
  const bearingOverlay = ref(true)

  const bearingFreqs = computed(() =>
    computeBearingFrequencies({
      rpmHz: bearingShaftRpm.value / 60,
      ...bearingParams.value,
    })
  )

  function setBearingPreset(name: string) {
    bearingPreset.value = name
    const p = BEARING_PRESETS.find(b => b.name === name)
    if (p) {
      bearingParams.value = {
        ballCount: p.ballCount,
        pitchDiamMm: p.pitchDiamMm,
        ballDiamMm: p.ballDiamMm,
        contactAngleDeg: p.contactAngleDeg,
      }
    }
  }

  function updateBearingParams(partial: Partial<typeof bearingParams.value>) {
    bearingParams.value = { ...bearingParams.value, ...partial }
    bearingPreset.value = 'Custom'
  }

  function setBearingShaftRpm(rpm: number) { bearingShaftRpm.value = rpm }
  function toggleBearingOverlay() { bearingOverlay.value = !bearingOverlay.value }

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
    // Watchdog: if no response in 1 s, free the slot so we keep retrying
    pendingTimer = setTimeout(() => {
      console.warn('[dsp] worker request timed out')
      pendingRequest = false
      pendingTimer = null
    }, 1000)
    const id = ++requestId
    const copy = samples.slice()
    // Spread fftConfig.value to a plain object — the reactive Proxy can't
    // be structured-cloned across the worker boundary (DataCloneError).
    const cfg = { ...fftConfig.value }
    worker.postMessage({ type: 'compute', samples: copy, config: cfg, channelId, requestId: id }, [copy.buffer])
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

  function setOctaveBands(result: OctaveBandResult) {
    octaveBands.value = result
  }

  function setOctaveWeighting(w: 'A' | 'C' | 'none') {
    octaveWeighting.value = w
  }

  function destroyWorker() {
    worker?.terminate()
    worker = null
  }

  return {
    fftConfig, selectedChannelId, fftResult, octaveBands, octaveWeighting,
    spectrumHistory, spectrumHistoryTotal, requestFft, setFftConfig, setSelectedChannel,
    setOctaveBands, setOctaveWeighting, destroyWorker,
    bearingPreset, bearingParams, bearingShaftRpm, bearingOverlay, bearingFreqs,
    setBearingPreset, updateBearingParams, setBearingShaftRpm, toggleBearingOverlay,
  }
})
