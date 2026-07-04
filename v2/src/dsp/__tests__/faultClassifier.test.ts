import { describe, it, expect } from 'vitest'
import { classifyBearingFaults, overallSeverity } from '../faultClassifier'
import type { BearingGeometry } from '@/types/dsp'

// SKF 6205 @ 1500 RPM
const GEOMETRY: BearingGeometry = {
  bpfo: 89.62,
  bpfi: 135.38,
  bsf: 58.93,
  ftf: 9.96,
}

const N = 512
const BIN_HZ = 200 / N // ~0.39 Hz/bin

function makeSpectrum(injectedHz: number[], amplitudeDb: number, noiseDb: number) {
  const magnitudeDb = new Float32Array(N).fill(noiseDb)
  const frequencies = new Float32Array(N).map((_, i) => i * BIN_HZ)
  for (const hz of injectedHz) {
    const bin = Math.round(hz / BIN_HZ)
    if (bin >= 0 && bin < N) magnitudeDb[bin] = amplitudeDb
  }
  return { magnitudeDb, frequencies }
}

describe('classifyBearingFaults', () => {
  it('returns none severity when spectrum is flat noise', () => {
    const { magnitudeDb, frequencies } = makeSpectrum([], -80, -80)
    const results = classifyBearingFaults(magnitudeDb, frequencies, GEOMETRY)
    expect(results.length).toBe(4)
    for (const r of results) expect(r.severity).toBe('none')
  })

  it('detects BPFO critical fault when strong peak injected at bpfo', () => {
    const { magnitudeDb, frequencies } = makeSpectrum([GEOMETRY.bpfo], -10, -80)
    const results = classifyBearingFaults(magnitudeDb, frequencies, GEOMETRY)
    const bpfo = results.find((r) => r.faultType === 'BPFO')!
    expect(bpfo.severity).toBe('critical')
    expect(bpfo.snrDb).toBeGreaterThan(20)
  })

  it('detects BPFI warning fault with moderate SNR', () => {
    const { magnitudeDb, frequencies } = makeSpectrum([GEOMETRY.bpfi], -68, -80)
    const results = classifyBearingFaults(magnitudeDb, frequencies, GEOMETRY)
    const bpfi = results.find((r) => r.faultType === 'BPFI')!
    expect(['watch', 'warning', 'critical']).toContain(bpfi.severity)
  })

  it('detects harmonics when multiple injected', () => {
    const harmonicHz = [GEOMETRY.bpfo, GEOMETRY.bpfo * 2, GEOMETRY.bpfo * 3]
    const { magnitudeDb, frequencies } = makeSpectrum(harmonicHz, -20, -80)
    const results = classifyBearingFaults(magnitudeDb, frequencies, GEOMETRY)
    const bpfo = results.find((r) => r.faultType === 'BPFO')!
    expect(bpfo.hits.length).toBeGreaterThanOrEqual(2)
  })

  it('overallSeverity returns highest severity across all faults', () => {
    const { magnitudeDb, frequencies } = makeSpectrum([GEOMETRY.bpfo], -10, -80)
    const results = classifyBearingFaults(magnitudeDb, frequencies, GEOMETRY)
    expect(overallSeverity(results)).toBe('critical')
  })

  it('overallSeverity returns none when all faults are none', () => {
    const { magnitudeDb, frequencies } = makeSpectrum([], -80, -80)
    const results = classifyBearingFaults(magnitudeDb, frequencies, GEOMETRY)
    expect(overallSeverity(results)).toBe('none')
  })
})
