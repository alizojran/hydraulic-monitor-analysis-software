import { describe, it, expect } from 'vitest'
import { computeRms, computePeak, computeCrestFactor, computeTHD } from '../metrics'

function f32(arr: number[]): Float32Array {
  return new Float32Array(arr)
}

describe('computeRms', () => {
  it('RMS of a DC signal equals its amplitude', () => {
    const sig = f32(new Array(1024).fill(3.0))
    expect(computeRms(sig)).toBeCloseTo(3.0, 5)
  })

  it('RMS of a pure sine wave = amplitude / √2', () => {
    const N = 4096
    const sig = new Float32Array(N)
    for (let i = 0; i < N; i++) sig[i] = Math.sin((2 * Math.PI * i) / 64)
    expect(computeRms(sig)).toBeCloseTo(1 / Math.SQRT2, 3)
  })

  it('RMS of zeros is zero', () => {
    expect(computeRms(f32([0, 0, 0, 0]))).toBe(0)
  })

  it('RMS of [-1, 1, -1, 1] = 1', () => {
    expect(computeRms(f32([-1, 1, -1, 1]))).toBeCloseTo(1, 5)
  })
})

describe('computePeak', () => {
  it('returns maximum absolute value', () => {
    expect(computePeak(f32([0.5, -2.0, 1.0, -0.3]))).toBe(2.0)
  })

  it('peak of all zeros is zero', () => {
    expect(computePeak(f32([0, 0, 0]))).toBe(0)
  })

  it('works with negative-only signal', () => {
    expect(computePeak(f32([-5, -3, -1]))).toBe(5)
  })
})

describe('computeCrestFactor', () => {
  it('crest factor of a sine wave ≈ √2', () => {
    const N = 4096
    const sig = new Float32Array(N)
    for (let i = 0; i < N; i++) sig[i] = Math.sin((2 * Math.PI * i) / 64)
    expect(computeCrestFactor(sig)).toBeCloseTo(Math.SQRT2, 2)
  })

  it('crest factor of DC signal = 1', () => {
    const sig = f32(new Array(64).fill(2.0))
    expect(computeCrestFactor(sig)).toBeCloseTo(1.0, 5)
  })

  it('returns 0 for all-zero input', () => {
    expect(computeCrestFactor(f32([0, 0, 0]))).toBe(0)
  })

  it('impulsive signal has high crest factor', () => {
    const sig = new Float32Array(1024).fill(0.01)
    sig[512] = 10.0 // single impulse
    expect(computeCrestFactor(sig)).toBeGreaterThan(10)
  })
})

describe('computeTHD', () => {
  it('returns 0 when fundamental bin is out of range', () => {
    const mag = f32([1, 2, 3, 4])
    expect(computeTHD(mag, 0)).toBe(0)
    expect(computeTHD(mag, 5)).toBe(0)
  })

  it('returns 0 when fundamental is zero', () => {
    const mag = f32(new Array(64).fill(0))
    expect(computeTHD(mag, 5)).toBe(0)
  })

  it('pure fundamental (no harmonics) gives THD near 0', () => {
    const mag = new Float32Array(256).fill(0)
    mag[10] = 1.0 // only fundamental
    expect(computeTHD(mag, 10)).toBeCloseTo(0, 5)
  })

  it('equal fundamental + 2nd harmonic gives THD = 1.0', () => {
    const mag = new Float32Array(256).fill(0)
    mag[10] = 1.0 // fundamental
    mag[20] = 1.0 // 2nd harmonic (equal amplitude)
    // THD = sqrt(H2^2) / H1 = 1.0
    expect(computeTHD(mag, 10, 2)).toBeCloseTo(1.0, 5)
  })
})
