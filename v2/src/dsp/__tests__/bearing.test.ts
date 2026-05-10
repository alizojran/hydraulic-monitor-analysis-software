import { describe, it, expect } from 'vitest'
import { computeBearingFrequencies } from '../bearing'

// Reference values computed from kinematic formulas independently
// SKF 6205: Z=9, Pd=39.04 mm, Bd=7.94 mm, α=0°, shaft 25 Hz (1500 RPM)
const REF_6205 = {
  rpmHz: 25,
  ballCount: 9,
  pitchDiamMm: 39.04,
  ballDiamMm: 7.94,
  contactAngleDeg: 0,
}

describe('computeBearingFrequencies', () => {
  it('computes BPFO for SKF 6205 at 1500 RPM', () => {
    const { bpfo } = computeBearingFrequencies(REF_6205)
    // BPFO = (Z/2) * rpmHz * (1 - Bd/Pd * cos(α))
    // = 4.5 * 25 * (1 - 7.94/39.04) = 4.5 * 25 * 0.7966 ≈ 89.62 Hz
    expect(bpfo).toBeCloseTo(89.62, 1)
  })

  it('computes BPFI for SKF 6205 at 1500 RPM', () => {
    const { bpfi } = computeBearingFrequencies(REF_6205)
    // BPFI = (Z/2) * rpmHz * (1 + Bd/Pd * cos(α))
    // = 4.5 * 25 * (1 + 7.94/39.04) ≈ 135.38 Hz
    expect(bpfi).toBeCloseTo(135.38, 1)
  })

  it('computes FTF for SKF 6205 at 1500 RPM', () => {
    const { ftf } = computeBearingFrequencies(REF_6205)
    // FTF = 0.5 * rpmHz * (1 - Bd/Pd * cos(α)) ≈ 9.958 Hz
    expect(ftf).toBeCloseTo(9.958, 1)
  })

  it('computes BSF for SKF 6205 at 1500 RPM', () => {
    const { bsf } = computeBearingFrequencies(REF_6205)
    // BSF = (Pd / (2*Bd)) * rpmHz * (1 - (Bd/Pd*cos(α))²)
    // = (39.04/15.88) * 25 * (1 - 0.2034²) ≈ 58.92 Hz
    expect(bsf).toBeGreaterThan(0)
    expect(bsf).toBeCloseTo(58.92, 0)
  })

  it('all frequencies are positive for valid input', () => {
    const res = computeBearingFrequencies(REF_6205)
    expect(res.bpfi).toBeGreaterThan(0)
    expect(res.bpfo).toBeGreaterThan(0)
    expect(res.bsf).toBeGreaterThan(0)
    expect(res.ftf).toBeGreaterThan(0)
  })

  it('BPFI > BPFO (inner race fault freq is always higher)', () => {
    const res = computeBearingFrequencies(REF_6205)
    expect(res.bpfi).toBeGreaterThan(res.bpfo)
  })

  it('scales linearly with shaft speed', () => {
    const slow = computeBearingFrequencies({ ...REF_6205, rpmHz: 10 })
    const fast = computeBearingFrequencies({ ...REF_6205, rpmHz: 20 })
    expect(fast.bpfi / slow.bpfi).toBeCloseTo(2, 5)
    expect(fast.bpfo / slow.bpfo).toBeCloseTo(2, 5)
    expect(fast.ftf  / slow.ftf ).toBeCloseTo(2, 5)
  })

  it('contact angle affects ball pass frequencies', () => {
    const zero = computeBearingFrequencies({ ...REF_6205, contactAngleDeg: 0 })
    const angled = computeBearingFrequencies({ ...REF_6205, contactAngleDeg: 15 })
    // cos(15°) < 1 → ratio = (Bd/Pd)*cos(α) decreases
    // BPFO = (Z/2)*rpmHz*(1 - ratio) → increases as ratio decreases
    // BPFI = (Z/2)*rpmHz*(1 + ratio) → decreases as ratio decreases
    expect(angled.bpfo).toBeGreaterThan(zero.bpfo)
    expect(angled.bpfi).toBeLessThan(zero.bpfi)
  })

  it('FAG 22320 contact angle 12° produces valid results', () => {
    const res = computeBearingFrequencies({
      rpmHz: 25, ballCount: 14, pitchDiamMm: 145.0, ballDiamMm: 28.0, contactAngleDeg: 12,
    })
    expect(res.bpfi).toBeGreaterThan(0)
    expect(res.bpfo).toBeGreaterThan(0)
  })
})
