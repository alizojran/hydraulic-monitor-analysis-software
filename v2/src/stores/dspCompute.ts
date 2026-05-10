import { defineStore } from 'pinia'
import { ref, shallowRef, watch } from 'vue'
import { DEFAULT_FFT_CONFIG } from '@/config/defaults'
import type { FftConfig, FftResult, OctaveBandResult } from '@/types/dsp'
import { loadPersisted, savePersisted } from '@/utils/persistedStore'

const COMPUTE_KEY = 'daq-dsp-config'
const COMPUTE_VERSION = 2

interface ComputePersistedData {
  fftConfig?: Partial<FftConfig>
  selectedChannelId?: string
  octaveWeighting?: 'A' | 'C' | 'none'
  envelopeMode?: boolean
  xAxisMode?: 'hz' | 'order'
}

export const useDspComputeStore = defineStore('dspCompute', () => {
  const saved =
    loadPersisted<ComputePersistedData>({ key: COMPUTE_KEY, version: COMPUTE_VERSION }) ?? {}

  const fftConfig = ref<FftConfig>({ ...DEFAULT_FFT_CONFIG, ...(saved.fftConfig ?? {}) })
  const selectedChannelId = ref<string>(saved.selectedChannelId ?? 'V02')
  const fftResult = shallowRef<FftResult | null>(null)
  const octaveBands = shallowRef<OctaveBandResult | null>(null)
  const octaveWeighting = ref<'A' | 'C' | 'none'>(saved.octaveWeighting ?? 'A')
  const envelopeMode = ref<boolean>(saved.envelopeMode ?? false)
  const xAxisMode = ref<'hz' | 'order'>(saved.xAxisMode ?? 'hz')

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
      console.error('[dspCompute] worker construction failed:', err)
      return
    }
    worker.onmessage = (e) => {
      if (e.data.type === 'result') {
        pendingRequest = false
        if (pendingTimer) {
          clearTimeout(pendingTimer)
          pendingTimer = null
        }
        fftResult.value = e.data.result
      } else if (e.data.type === 'error') {
        console.error('[dspCompute] worker error:', e.data.error)
        pendingRequest = false
        if (pendingTimer) {
          clearTimeout(pendingTimer)
          pendingTimer = null
        }
      }
    }
    worker.onerror = (ev) => {
      console.error('[dspCompute] worker onerror:', ev.message || ev)
      pendingRequest = false
      if (pendingTimer) {
        clearTimeout(pendingTimer)
        pendingTimer = null
      }
    }
  }

  function requestFft(samples: Float32Array, channelId: string) {
    if (pendingRequest) return
    initWorker()
    if (!worker) return
    pendingRequest = true
    pendingTimer = setTimeout(() => {
      console.warn('[dspCompute] worker request timed out')
      pendingRequest = false
      pendingTimer = null
    }, 1000)
    const id = ++requestId
    const copy = samples.slice()
    worker.postMessage(
      {
        type: 'compute',
        samples: copy,
        config: { ...fftConfig.value },
        channelId,
        requestId: id,
        envelope: envelopeMode.value,
      },
      [copy.buffer],
    )
  }

  function setFftConfig(partial: Partial<FftConfig>) {
    fftConfig.value = { ...fftConfig.value, ...partial }
  }

  function setSelectedChannel(id: string) {
    selectedChannelId.value = id
    fftResult.value = null
  }

  function setOctaveBands(result: OctaveBandResult) {
    octaveBands.value = result
  }
  function setOctaveWeighting(w: 'A' | 'C' | 'none') {
    octaveWeighting.value = w
  }
  function toggleEnvelopeMode() {
    envelopeMode.value = !envelopeMode.value
  }
  function setEnvelopeMode(v: boolean) {
    envelopeMode.value = v
  }
  function toggleXAxisMode() {
    xAxisMode.value = xAxisMode.value === 'hz' ? 'order' : 'hz'
  }
  function setXAxisMode(m: 'hz' | 'order') {
    xAxisMode.value = m
  }

  function destroyWorker() {
    worker?.terminate()
    worker = null
  }

  // ─── Debounced persistence ────────────────────────────────────────────────
  let _saveTimer: ReturnType<typeof setTimeout> | null = null
  function _scheduleSave() {
    if (_saveTimer) clearTimeout(_saveTimer)
    _saveTimer = setTimeout(() => {
      savePersisted<ComputePersistedData>({ key: COMPUTE_KEY, version: COMPUTE_VERSION }, {
        fftConfig: fftConfig.value,
        selectedChannelId: selectedChannelId.value,
        octaveWeighting: octaveWeighting.value,
        envelopeMode: envelopeMode.value,
        xAxisMode: xAxisMode.value,
      })
    }, 300)
  }

  watch([fftConfig, octaveWeighting, envelopeMode, xAxisMode, selectedChannelId], _scheduleSave, {
    deep: true,
  })

  return {
    fftConfig,
    selectedChannelId,
    fftResult,
    octaveBands,
    octaveWeighting,
    envelopeMode,
    xAxisMode,
    requestFft,
    setFftConfig,
    setSelectedChannel,
    setOctaveBands,
    setOctaveWeighting,
    toggleEnvelopeMode,
    setEnvelopeMode,
    toggleXAxisMode,
    setXAxisMode,
    destroyWorker,
  }
})
