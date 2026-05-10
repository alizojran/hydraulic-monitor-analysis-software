// 1/3 octave band analysis with A/C weighting (IEC 61672)

export const THIRD_OCTAVE_CENTERS = [
  25, 31.5, 40, 50, 63, 80, 100, 125, 160, 200, 250, 315, 400, 500, 630, 800, 1000, 1250, 1600,
  2000, 2500, 3150, 4000, 5000, 6300, 8000, 10000, 12500, 16000, 20000,
] as const

// A-weighting corrections in dB (IEC 61672 Table 1)
const A_WEIGHT: Record<number, number> = {
  25: -44.7,
  31.5: -39.4,
  40: -34.6,
  50: -30.2,
  63: -26.2,
  80: -22.5,
  100: -19.1,
  125: -16.1,
  160: -13.4,
  200: -10.9,
  250: -8.6,
  315: -6.6,
  400: -4.8,
  500: -3.2,
  630: -1.9,
  800: -0.8,
  1000: 0,
  1250: 0.6,
  1600: 1.0,
  2000: 1.2,
  2500: 1.3,
  3150: 1.2,
  4000: 1.0,
  5000: 0.5,
  6300: -0.1,
  8000: -1.1,
  10000: -2.5,
  12500: -4.3,
  16000: -6.7,
  20000: -9.3,
}

// C-weighting corrections in dB
const C_WEIGHT: Record<number, number> = {
  25: -4.4,
  31.5: -3.0,
  40: -2.0,
  50: -1.3,
  63: -0.8,
  80: -0.5,
  100: -0.3,
  125: -0.2,
  160: -0.1,
  200: 0,
  250: 0,
  315: 0,
  400: 0,
  500: 0,
  630: 0,
  800: 0,
  1000: 0,
  1250: 0,
  1600: -0.1,
  2000: -0.2,
  2500: -0.3,
  3150: -0.5,
  4000: -0.8,
  5000: -1.3,
  6300: -2.0,
  8000: -3.0,
  10000: -4.4,
  12500: -6.2,
  16000: -8.5,
  20000: -11.2,
}

// Cache bin ranges per band, keyed by binHz. Frequencies are evenly spaced
// (frequencies[i] = i * binHz), so we can compute start/end indices in O(1).
const rangeCache = new Map<number, { starts: Int32Array; ends: Int32Array }>()
function getRanges(binHz: number, fftLen: number) {
  const key = binHz
  const cached = rangeCache.get(key)
  if (cached) return cached
  const factor = Math.pow(2, 1 / 6)
  const starts = new Int32Array(THIRD_OCTAVE_CENTERS.length)
  const ends = new Int32Array(THIRD_OCTAVE_CENTERS.length)
  for (let bi = 0; bi < THIRD_OCTAVE_CENTERS.length; bi++) {
    const fc = THIRD_OCTAVE_CENTERS[bi]
    starts[bi] = Math.max(0, Math.ceil(fc / factor / binHz))
    ends[bi] = Math.min(fftLen - 1, Math.floor((fc * factor) / binHz))
  }
  const v = { starts, ends }
  rangeCache.set(key, v)
  return v
}

export function computeOctaveBands(
  magnitudeDb: Float32Array,
  frequencies: Float32Array,
  weighting: 'A' | 'C' | 'none',
): Float32Array {
  const result = new Float32Array(THIRD_OCTAVE_CENTERS.length)
  const binHz = frequencies.length > 1 ? frequencies[1] - frequencies[0] : 1
  const { starts, ends } = getRanges(binHz, frequencies.length)
  const weightMap = weighting === 'A' ? A_WEIGHT : weighting === 'C' ? C_WEIGHT : null

  for (let bi = 0; bi < THIRD_OCTAVE_CENTERS.length; bi++) {
    const s = starts[bi],
      e = ends[bi]
    let maxDb = -120
    for (let i = s; i <= e; i++) {
      if (magnitudeDb[i] > maxDb) maxDb = magnitudeDb[i]
    }
    const correction = weightMap ? (weightMap[THIRD_OCTAVE_CENTERS[bi]] ?? 0) : 0
    result[bi] = maxDb === -120 ? 0 : Math.max(0, (maxDb + correction + 120) / 120)
  }

  return result
}
