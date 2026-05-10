/**
 * @deprecated Use useDspComputeStore, useBearingModelStore, or useSpectrumHistoryStore directly.
 *             This facade exists for backward compatibility while components are being migrated.
 */
import { defineStore } from 'pinia'
import { computed, watch } from 'vue'
import { useDspComputeStore } from './dspCompute'
import { useBearingModelStore } from './bearingModel'
import { useSpectrumHistoryStore } from './spectrumHistory'

// Re-export types and constants so existing imports keep working
export type { BearingPreset, BearingState } from './bearingModel'
export { BEARING_PRESETS, getBearingColorSet } from './bearingModel'

export const useDspStore = defineStore('dsp', () => {
  const compute = useDspComputeStore()
  const bearing = useBearingModelStore()
  const history = useSpectrumHistoryStore()

  // Bridge: push new FFT results into spectrum history automatically
  watch(
    () => compute.fftResult,
    (result) => {
      if (result) history.pushColumn(result.magnitudeDb)
    },
  )

  const spectrumHistory = computed(() => history.spectrumHistory)
  const spectrumHistoryTotal = computed(() => history.spectrumHistoryTotal)

  function requestFft(samples: Float32Array, channelId: string) {
    compute.requestFft(samples, channelId)
  }

  return {
    // ── FFT / compute ────────────────────────────────────────────────────
    fftConfig: computed(() => compute.fftConfig),
    selectedChannelId: computed(() => compute.selectedChannelId),
    fftResult: computed(() => compute.fftResult),
    octaveBands: computed(() => compute.octaveBands),
    octaveWeighting: computed(() => compute.octaveWeighting),
    envelopeMode: computed(() => compute.envelopeMode),
    xAxisMode: computed(() => compute.xAxisMode),
    requestFft,
    setFftConfig: compute.setFftConfig.bind(compute),
    setSelectedChannel: (id: string) => {
      compute.setSelectedChannel(id)
      history.clearHistory()
    },
    setOctaveBands: compute.setOctaveBands.bind(compute),
    setOctaveWeighting: compute.setOctaveWeighting.bind(compute),
    toggleEnvelopeMode: compute.toggleEnvelopeMode.bind(compute),
    setEnvelopeMode: compute.setEnvelopeMode.bind(compute),
    toggleXAxisMode: compute.toggleXAxisMode.bind(compute),
    setXAxisMode: compute.setXAxisMode.bind(compute),
    destroyWorker: compute.destroyWorker.bind(compute),
    // ── Spectrum history ─────────────────────────────────────────────────
    spectrumHistory,
    spectrumHistoryTotal,
    // ── Bearings ─────────────────────────────────────────────────────────
    bearings: computed(() => bearing.bearings),
    allBearingFreqs: computed(() => bearing.allBearingFreqs),
    bearingShaftRpm: computed(() => bearing.bearingShaftRpm),
    bearingPreset: computed(() => bearing.bearingPreset),
    bearingParams: computed(() => bearing.bearingParams),
    bearingOverlay: computed(() => bearing.bearingOverlay),
    bearingFreqs: computed(() => bearing.bearingFreqs),
    addBearing: bearing.addBearing.bind(bearing),
    removeBearing: bearing.removeBearing.bind(bearing),
    setBearingName: bearing.setBearingName.bind(bearing),
    setBearingShaftRpm: bearing.setBearingShaftRpm.bind(bearing),
    setBearingPreset: bearing.setBearingPreset.bind(bearing),
    updateBearingParams: bearing.updateBearingParams.bind(bearing),
    toggleBearingOverlay: bearing.toggleBearingOverlay.bind(bearing),
    // ── Gear ─────────────────────────────────────────────────────────────
    gearTeeth: computed(() => bearing.gearTeeth),
    gearOverlay: computed(() => bearing.gearOverlay),
    gearFreqs: computed(() => bearing.gearFreqs),
    setGearTeeth: bearing.setGearTeeth.bind(bearing),
    toggleGearOverlay: bearing.toggleGearOverlay.bind(bearing),
    setBearings: bearing.setBearings.bind(bearing),
    setGearOverlay: bearing.setGearOverlay.bind(bearing),
  }
})
