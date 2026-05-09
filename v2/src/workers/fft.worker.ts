import { getWindow } from '../dsp/window'
import { computeRms, computePeak, computeTHD } from '../dsp/metrics'
import type { FftConfig, FftResult, PeakInfo } from '../types/dsp'

interface FftRequest {
  type: 'compute'
  samples: Float32Array
  config: FftConfig
  channelId: string
  requestId: number
}

/**
 * Iterative radix-2 Cooley-Tukey FFT, in-place on interleaved complex arrays
 * (length = 2 * N, [re0, im0, re1, im1, …]). Self-contained — no CJS/ESM
 * interop concerns inside a module worker.
 */
function fftInPlace(re: Float32Array, im: Float32Array): void {
  const N = re.length
  // bit-reversal permutation
  let j = 0
  for (let i = 0; i < N - 1; i++) {
    if (i < j) {
      const tr = re[i]; re[i] = re[j]; re[j] = tr
      const ti = im[i]; im[i] = im[j]; im[j] = ti
    }
    let k = N >> 1
    while (k <= j) { j -= k; k >>= 1 }
    j += k
  }
  // butterflies
  for (let len = 2; len <= N; len <<= 1) {
    const half = len >> 1
    const angStep = -2 * Math.PI / len
    for (let i = 0; i < N; i += len) {
      for (let k = 0; k < half; k++) {
        const ang = angStep * k
        const wr = Math.cos(ang), wi = Math.sin(ang)
        const ix = i + k, jx = ix + half
        const tr = wr * re[jx] - wi * im[jx]
        const ti = wr * im[jx] + wi * re[jx]
        re[jx] = re[ix] - tr; im[jx] = im[ix] - ti
        re[ix] = re[ix] + tr; im[ix] = im[ix] + ti
      }
    }
  }
}

function parabolicPeak(mag: Float32Array, bin: number): number {
  if (bin <= 0 || bin >= mag.length - 1) return bin
  const a = mag[bin - 1], b = mag[bin], c = mag[bin + 1]
  const denom = a - 2 * b + c
  if (Math.abs(denom) < 1e-10) return bin
  return bin - 0.5 * (c - a) / denom
}

function findPeaks(magnitudeDb: Float32Array, magnitudeLinear: Float32Array, frequencies: Float32Array, binHz: number, n = 8): PeakInfo[] {
  const minBin = Math.max(1, Math.floor(10 / binHz))
  const peaks: PeakInfo[] = []

  for (let i = minBin + 1; i < magnitudeDb.length - 1; i++) {
    if (magnitudeDb[i] > magnitudeDb[i - 1] && magnitudeDb[i] > magnitudeDb[i + 1] && magnitudeDb[i] > -60) {
      peaks.push({ frequency: frequencies[i], amplitudeDb: magnitudeDb[i], binIndex: i })
    }
  }
  peaks.sort((a, b) => b.amplitudeDb - a.amplitudeDb)

  const filtered: PeakInfo[] = []
  for (const p of peaks) {
    let tooClose = false
    for (const f of filtered) {
      if (Math.abs(p.binIndex - f.binIndex) < 3) { tooClose = true; break }
    }
    if (!tooClose) {
      const interpBin = parabolicPeak(magnitudeLinear, p.binIndex)
      filtered.push({ ...p, frequency: interpBin * binHz })
      if (filtered.length >= n) break
    }
  }
  return filtered
}

self.onmessage = (e: MessageEvent<FftRequest>) => {
  const { type, samples, config, channelId, requestId } = e.data
  if (type !== 'compute') return

  const t0 = performance.now()
  const { fftSize, window: windowName, sampleRate } = config

  const win = getWindow(windowName, fftSize)
  const windowed = new Float32Array(fftSize)

  // Use the last fftSize samples (or left-zero-pad if fewer)
  const start = Math.max(0, samples.length - fftSize)
  const padLeft = Math.max(0, fftSize - samples.length)
  for (let i = 0; i < fftSize; i++) {
    const s = i < padLeft ? 0 : samples[start + (i - padLeft)]
    windowed[i] = s * win[i]
  }

  // Real-valued input → complex (imag = 0)
  const re = new Float32Array(fftSize)
  const im = new Float32Array(fftSize)
  re.set(windowed)
  fftInPlace(re, im)

  const halfN = fftSize / 2
  const magnitudeLinear = new Float32Array(halfN)
  const magnitudeDb = new Float32Array(halfN)
  const frequencies = new Float32Array(halfN)
  const binHz = sampleRate / fftSize
  const scale = 2 / fftSize

  for (let i = 0; i < halfN; i++) {
    const r = re[i], m = im[i]
    const mag = Math.sqrt(r * r + m * m) * scale
    magnitudeLinear[i] = mag
    magnitudeDb[i] = mag > 1e-10 ? 20 * Math.log10(mag) : -120
    frequencies[i] = i * binHz
  }

  const peaks = findPeaks(magnitudeDb, magnitudeLinear, frequencies, binHz)
  const f0Bin = peaks.length > 0 ? peaks[0].binIndex : 0
  const thd = computeTHD(magnitudeLinear, f0Bin)
  const rms = computeRms(windowed)
  const peakValue = computePeak(windowed)
  const crestFactor = rms > 0 ? peakValue / rms : 0

  const result: FftResult = { magnitudeDb, magnitudeLinear, frequencies, binHz, peaks, thd, rms, peakValue, crestFactor }

  const msg = { type: 'result', result, channelId, requestId, processingMs: performance.now() - t0 }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ;(self as any).postMessage(msg, [magnitudeDb.buffer, magnitudeLinear.buffer, frequencies.buffer])
}
