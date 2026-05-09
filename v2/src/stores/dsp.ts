import { defineStore } from 'pinia'
import { ref, shallowRef } from 'vue'
import { DEFAULT_FFT_CONFIG } from '@/config/defaults'
import type { FftConfig, FftResult, OctaveBandResult } from '@/types/dsp'

export const useDspStore = defineStore('dsp', () => {
  const fftConfig = ref<FftConfig>({ ...DEFAULT_FFT_CONFIG })
  const selectedChannelId = ref('V02')
  const fftResult = shallowRef<FftResult | null>(null)
  const octaveBands = shallowRef<OctaveBandResult | null>(null)
  const octaveWeighting = ref<'A' | 'C' | 'none'>('A')
  const spectrumHistory = shallowRef<Float32Array[]>([])
  const spectrumHistoryTotal = ref(0)
  const maxHistoryCols = 360

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
  }
})
