import { defineStore } from 'pinia'
import { shallowRef, ref } from 'vue'

const MAX_HISTORY_COLS = 360

export const useSpectrumHistoryStore = defineStore('spectrumHistory', () => {
  const spectrumHistory = shallowRef<Float32Array[]>([])
  const spectrumHistoryTotal = ref(0)

  function pushColumn(magnitudeDb: Float32Array) {
    const col = new Float32Array(magnitudeDb.length)
    for (let i = 0; i < magnitudeDb.length; i++)
      col[i] = Math.max(0, Math.min(1, (magnitudeDb[i] + 120) / 120))
    const hist = [...spectrumHistory.value, col]
    if (hist.length > MAX_HISTORY_COLS) hist.shift()
    spectrumHistory.value = hist
    spectrumHistoryTotal.value++
  }

  function clearHistory() {
    spectrumHistory.value = []
    spectrumHistoryTotal.value = 0
  }

  return {
    spectrumHistory,
    spectrumHistoryTotal,
    pushColumn,
    clearHistory,
  }
})
