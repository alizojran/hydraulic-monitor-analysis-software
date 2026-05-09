// FFT worker — fully self-contained (no imports) to avoid any
// CJS/ESM interop or path-resolution issue inside a module worker.

interface FftConfig {
  fftSize: number
  overlap: number
  window: 'hamming' | 'hanning' | 'blackman' | 'flattop' | 'rect'
  averages: number
  sampleRate: number
}

interface PeakInfo {
  frequency: number
  amplitudeDb: number
  binIndex: number
}

interface FftRequest {
  type: 'compute'
  samples: Float32Array
  config: FftConfig
  channelId: string
  requestId: number
}

// ─── Window functions ───────────────────────────────────────────────
function getWindow(name: string, N: number): Float32Array {
  const w = new Float32Array(N)
  switch (name) {
    case 'hamming':
      for (let i = 0; i < N; i++) w[i] = 0.54 - 0.46 * Math.cos((2 * Math.PI * i) / (N - 1))
      return w
    case 'hanning':
      for (let i = 0; i < N; i++) w[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (N - 1)))
      return w
    case 'blackman':
      for (let i = 0; i < N; i++) {
        w[i] = 0.42 - 0.5 * Math.cos((2 * Math.PI * i) / (N - 1)) + 0.08 * Math.cos((4 * Math.PI * i) / (N - 1))
      }
      return w
    case 'flattop': {
      const a0 = 0.21557895, a1 = 0.41663158, a2 = 0.27726316, a3 = 0.08357895, a4 = 0.00694737
      for (let i = 0; i < N; i++) {
        const x = (2 * Math.PI * i) / (N - 1)
        w[i] = a0 - a1 * Math.cos(x) + a2 * Math.cos(2 * x) - a3 * Math.cos(3 * x) + a4 * Math.cos(4 * x)
      }
      return w
    }
    default:
      w.fill(1); return w
  }
}

// ─── Iterative radix-2 Cooley-Tukey FFT (in-place on re/im pairs) ──
// Twiddle factors are computed once per fftSize and cached — cuts the
// per-call cos/sin work from ~11k calls (for N=2048) to zero on hits.
const twiddleCache = new Map<number, Float64Array>()
function getTwiddles(N: number): Float64Array {
  const cached = twiddleCache.get(N)
  if (cached) return cached
  // Total pairs across all stages: 1 + 2 + 4 + ... + N/2 = N - 1
  const t = new Float64Array(2 * (N - 1))
  let off = 0
  for (let len = 2; len <= N; len <<= 1) {
    const half = len >> 1
    const angStep = -2 * Math.PI / len
    for (let k = 0; k < half; k++) {
      t[off++] = Math.cos(angStep * k)
      t[off++] = Math.sin(angStep * k)
    }
  }
  twiddleCache.set(N, t)
  return t
}

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
  const t = getTwiddles(N)
  let off = 0
  for (let len = 2; len <= N; len <<= 1) {
    const half = len >> 1
    for (let i = 0; i < N; i += len) {
      let to = off
      for (let k = 0; k < half; k++) {
        const wr = t[to++], wi = t[to++]
        const ix = i + k, jx = ix + half
        const tr = wr * re[jx] - wi * im[jx]
        const ti = wr * im[jx] + wi * re[jx]
        re[jx] = re[ix] - tr; im[jx] = im[ix] - ti
        re[ix] = re[ix] + tr; im[ix] = im[ix] + ti
      }
    }
    off += half * 2
  }
}

// ─── Helpers ────────────────────────────────────────────────────────
function computeRms(samples: Float32Array): number {
  let s = 0
  for (let i = 0; i < samples.length; i++) s += samples[i] * samples[i]
  return Math.sqrt(s / samples.length)
}
function computePeak(samples: Float32Array): number {
  let m = 0
  for (let i = 0; i < samples.length; i++) {
    const a = Math.abs(samples[i]); if (a > m) m = a
  }
  return m
}
function computeTHD(magLin: Float32Array, f0Bin: number, harmonics = 5): number {
  if (f0Bin <= 0 || f0Bin >= magLin.length) return 0
  const f0Pow = magLin[f0Bin] * magLin[f0Bin]
  if (f0Pow === 0) return 0
  let hp = 0
  for (let h = 2; h <= harmonics; h++) {
    const bin = f0Bin * h
    if (bin < magLin.length) hp += magLin[bin] * magLin[bin]
  }
  return Math.sqrt(hp / f0Pow)
}
function parabolicPeak(mag: Float32Array, bin: number): number {
  if (bin <= 0 || bin >= mag.length - 1) return bin
  const a = mag[bin - 1], b = mag[bin], c = mag[bin + 1]
  const denom = a - 2 * b + c
  if (Math.abs(denom) < 1e-10) return bin
  return bin - 0.5 * (c - a) / denom
}
function findPeaks(magDb: Float32Array, magLin: Float32Array, freqs: Float32Array, binHz: number, n = 8): PeakInfo[] {
  const minBin = Math.max(1, Math.floor(10 / binHz))
  const peaks: PeakInfo[] = []
  for (let i = minBin + 1; i < magDb.length - 1; i++) {
    if (magDb[i] > magDb[i - 1] && magDb[i] > magDb[i + 1] && magDb[i] > -60) {
      peaks.push({ frequency: freqs[i], amplitudeDb: magDb[i], binIndex: i })
    }
  }
  peaks.sort((a, b) => b.amplitudeDb - a.amplitudeDb)
  const filtered: PeakInfo[] = []
  for (const p of peaks) {
    let close = false
    for (const f of filtered) if (Math.abs(p.binIndex - f.binIndex) < 3) { close = true; break }
    if (!close) {
      const interpBin = parabolicPeak(magLin, p.binIndex)
      filtered.push({ ...p, frequency: interpBin * binHz })
      if (filtered.length >= n) break
    }
  }
  return filtered
}

// ─── Message handler ────────────────────────────────────────────────
self.onmessage = (e: MessageEvent<FftRequest>) => {
  try {
    const { type, samples, config, channelId, requestId } = e.data
    if (type !== 'compute') return

    const t0 = performance.now()
    const { fftSize, window: windowName, sampleRate } = config

    const win = getWindow(windowName, fftSize)
    const windowed = new Float32Array(fftSize)
    const start = Math.max(0, samples.length - fftSize)
    const padLeft = Math.max(0, fftSize - samples.length)
    for (let i = 0; i < fftSize; i++) {
      const s = i < padLeft ? 0 : samples[start + (i - padLeft)]
      windowed[i] = s * win[i]
    }

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

    const result = { magnitudeDb, magnitudeLinear, frequencies, binHz, peaks, thd, rms, peakValue, crestFactor }
    const msg = { type: 'result', result, channelId, requestId, processingMs: performance.now() - t0 }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(self as any).postMessage(msg, [magnitudeDb.buffer, magnitudeLinear.buffer, frequencies.buffer])
  } catch (err) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(self as any).postMessage({ type: 'error', error: String(err) })
  }
}
