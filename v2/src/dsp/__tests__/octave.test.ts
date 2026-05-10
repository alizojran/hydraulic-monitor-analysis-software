import { describe, it, expect } from 'vitest'
import { computeOctaveBands, THIRD_OCTAVE_CENTERS } from '../octave'

function makeFlat(
  fftLen: number,
  binHz: number,
  levelDb: number,
): { mag: Float32Array; freq: Float32Array } {
  const mag = new Float32Array(fftLen).fill(levelDb)
  const freq = new Float32Array(fftLen)
  for (let i = 0; i < fftLen; i++) freq[i] = i * binHz
  return { mag, freq }
}

describe('computeOctaveBands', () => {
  it('returns 30 bands (THIRD_OCTAVE_CENTERS length)', () => {
    const { mag, freq } = makeFlat(2048, 4.88, -20)
    const result = computeOctaveBands(mag, freq, 'none')
    expect(result.length).toBe(THIRD_OCTAVE_CENTERS.length)
    expect(result.length).toBe(30)
  })

  it('all values are in [0, 1] range', () => {
    const { mag, freq } = makeFlat(4096, 2.44, -30)
    const result = computeOctaveBands(mag, freq, 'A')
    for (let i = 0; i < result.length; i++) {
      expect(result[i]).toBeGreaterThanOrEqual(0)
      expect(result[i]).toBeLessThanOrEqual(1)
    }
  })

  it('no-weighting gives higher mid-high values than A-weighting at low bands', () => {
    const { mag, freq } = makeFlat(8192, 1.22, -20)
    const noW = computeOctaveBands(mag, freq, 'none')
    const aW = computeOctaveBands(mag, freq, 'A')
    // At 25 Hz (band 0), A-weighting correction is -44.7 dB → A-weighted should be lower
    expect(noW[0]).toBeGreaterThan(aW[0])
  })

  it('A and C weighting agree near 1 kHz (correction ≈ 0)', () => {
    const { mag, freq } = makeFlat(8192, 1.22, -20)
    const aW = computeOctaveBands(mag, freq, 'A')
    const cW = computeOctaveBands(mag, freq, 'C')
    // Band 14 = 630 Hz, band 15 = 800 Hz, band 16 = 1000 Hz — A and C corrections ≈ same
    const idx1k = THIRD_OCTAVE_CENTERS.indexOf(1000)
    expect(aW[idx1k]).toBeCloseTo(cW[idx1k], 2)
  })

  it('zero spectrum gives all-zero output', () => {
    const fftLen = 2048
    const mag = new Float32Array(fftLen).fill(-120)
    const freq = new Float32Array(fftLen).map((_, i) => i * 5)
    const result = computeOctaveBands(mag, freq, 'none')
    for (let i = 0; i < result.length; i++) {
      expect(result[i]).toBe(0)
    }
  })

  it('THIRD_OCTAVE_CENTERS are in ascending order', () => {
    for (let i = 1; i < THIRD_OCTAVE_CENTERS.length; i++) {
      expect(THIRD_OCTAVE_CENTERS[i]).toBeGreaterThan(THIRD_OCTAVE_CENTERS[i - 1])
    }
  })
})
