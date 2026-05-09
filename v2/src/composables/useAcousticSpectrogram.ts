import { onMounted, onUnmounted } from 'vue'
import { useAcquisitionStore } from '@/stores/acquisition'

// ─── Pre-compute the 64 × 128 cos/sin matrix once ─────────────────
const N = 128         // input window size
const BINS = 64       // output frequency bins
const COS = new Float32Array(BINS * N)
const SIN = new Float32Array(BINS * N)
const HANN = new Float32Array(N)
{
  for (let n = 0; n < N; n++) HANN[n] = 0.5 * (1 - Math.cos((2 * Math.PI * n) / (N - 1)))
  for (let k = 0; k < BINS; k++) {
    const w = (Math.PI * (k + 1)) / BINS
    const base = k * N
    for (let n = 0; n < N; n++) {
      COS[base + n] = Math.cos(w * n)
      SIN[base + n] = Math.sin(w * n)
    }
  }
}

/**
 * App-level ticker that computes the S01 acoustic spectrogram column
 * every 100 ms and stores it in the acquisition store. Runs regardless
 * of which tab is active, so the AcousticCard can restore its waterfall
 * history immediately after a tab switch.
 */
export function useAcousticSpectrogram() {
  const acqStore = useAcquisitionStore()
  let timer: ReturnType<typeof setInterval> | null = null

  function tick() {
    if (!acqStore.isRunning || acqStore.isPaused) return
    const raw = acqStore.getFftSamples('S01', N)
    if (raw.length < N) return

    // DC removal + Hann window — fused into one pass
    let mean = 0
    for (let n = 0; n < N; n++) mean += raw[n]
    mean /= N
    const win = new Float32Array(N)
    for (let n = 0; n < N; n++) win[n] = (raw[n] - mean) * HANN[n]

    const col = new Float32Array(BINS)
    for (let k = 0; k < BINS; k++) {
      const base = k * N
      let sr = 0, si = 0
      for (let n = 0; n < N; n++) {
        const v = win[n]
        sr += v * COS[base + n]
        si += v * SIN[base + n]
      }
      const mag = Math.sqrt(sr * sr + si * si) / N
      col[k] = Math.max(0, Math.min(1, Math.log10(1 + mag * 12) * 0.7))
    }

    acqStore.pushAcousticColumn(col)
  }

  onMounted(() => { timer = setInterval(tick, 100) })
  onUnmounted(() => { if (timer) clearInterval(timer) })
}
