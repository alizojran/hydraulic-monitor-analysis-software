import FFT from 'fft.js'
import { getWindow } from '../dsp/window'
import { computeRms, computePeak, computeCrestFactor, computeTHD } from '../dsp/metrics'
import type { FftConfig, FftResult, PeakInfo } from '../types/dsp'

interface FftRequest {
  type: 'compute'
  samples: Float32Array
  config: FftConfig
  channelId: string
  requestId: number
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
  const used = new Set<number>()

  // simple local maxima detection
  for (let i = minBin + 1; i < magnitudeDb.length - 1; i++) {
    if (magnitudeDb[i] > magnitudeDb[i - 1] && magnitudeDb[i] > magnitudeDb[i + 1] && magnitudeDb[i] > -60) {
      peaks.push({ frequency: frequencies[i], amplitudeDb: magnitudeDb[i], binIndex: i })
    }
  }
  peaks.sort((a, b) => b.amplitudeDb - a.amplitudeDb)

  // remove peaks too close to each other (within 3 bins)
  const filtered: PeakInfo[] = []
  for (const p of peaks) {
    let tooClose = false
    for (const f of filtered) {
      if (Math.abs(p.binIndex - f.binIndex) < 3) { tooClose = true; break }
    }
    if (!tooClose) {
      // parabolic interpolation for sub-bin accuracy
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

  // Use the last fftSize samples (or zero-pad if fewer)
  const offset = Math.max(0, samples.length - fftSize)
  for (let i = 0; i < fftSize; i++) {
    const s = i < (fftSize - offset) ? 0 : samples[offset + i - (fftSize - offset)]
    windowed[i] = (s || 0) * win[i]
  }

  // fft.js expects real/imag interleaved output array
  const fft = new FFT(fftSize)
  const complexOut = fft.createComplexArray()
  const complexIn = fft.toComplexArray(Array.from(windowed), null)
  fft.transform(complexOut, complexIn)

  const halfN = fftSize / 2
  const magnitudeLinear = new Float32Array(halfN)
  const magnitudeDb = new Float32Array(halfN)
  const frequencies = new Float32Array(halfN)
  const binHz = sampleRate / fftSize
  const scale = 2 / fftSize

  for (let i = 0; i < halfN; i++) {
    const re = complexOut[2 * i], im = complexOut[2 * i + 1]
    const mag = Math.sqrt(re * re + im * im) * scale
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
