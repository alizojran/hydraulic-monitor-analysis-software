/**
 * Rule-based bearing fault classifier.
 *
 * Algorithm:
 *  1. For each fault frequency (BPFO, BPFI, BSF, FTF) and its harmonics,
 *     find the peak amplitude within a ±tolerance window in the FFT spectrum.
 *  2. Compute the mean noise floor from bins far from all fault frequencies.
 *  3. Calculate SNR = peakDb - noiseFloorDb.
 *  4. Map SNR to a severity level using configurable thresholds.
 *
 * References:
 *  - ISO 13373-3:2015 Condition monitoring of machines — vibration
 *  - SKF Bearing Maintenance Handbook, chapter 6
 */
import type { BearingGeometry } from '@/types/dsp'

export type FaultSeverity = 'none' | 'watch' | 'warning' | 'critical'

export interface FaultFrequencyHit {
  frequencyHz: number
  amplitudeDb: number
  harmonicOrder: number
  snrDb: number
}

export interface BearingFaultResult {
  label: string
  faultType: 'BPFO' | 'BPFI' | 'BSF' | 'FTF'
  severity: FaultSeverity
  snrDb: number
  hits: FaultFrequencyHit[]
  description: string
  descriptionZh: string
}

export interface FaultClassifierConfig {
  /** Fraction of bin spacing used as ±tolerance window around each fault frequency */
  toleranceFrac?: number
  /** How many harmonics to check per fault frequency (1 = fundamental only) */
  harmonics?: number
  /** SNR thresholds (dB) for watch / warning / critical */
  thresholds?: { watch: number; warning: number; critical: number }
}

const DEFAULT_CONFIG: Required<FaultClassifierConfig> = {
  toleranceFrac: 0.25,
  harmonics: 3,
  thresholds: { watch: 6, warning: 12, critical: 20 },
}

const FAULT_META: Record<
  BearingFaultResult['faultType'],
  { label: string; description: string; descriptionZh: string }
> = {
  BPFO: {
    label: 'BPFO',
    description: 'Ball Pass Frequency Outer race — outer race spalling / fatigue',
    descriptionZh: '外圈球通过频率 — 外圈剥落/疲劳',
  },
  BPFI: {
    label: 'BPFI',
    description: 'Ball Pass Frequency Inner race — inner race spalling / misalignment',
    descriptionZh: '内圈球通过频率 — 内圈剥落/对中不良',
  },
  BSF: {
    label: 'BSF',
    description: 'Ball Spin Frequency — ball surface damage / contamination',
    descriptionZh: '滚动体自转频率 — 滚动体表面损伤/污染',
  },
  FTF: {
    label: 'FTF',
    description: 'Fundamental Train Frequency — cage defect / lubrication failure',
    descriptionZh: '保持架基本频率 — 保持架缺陷/润滑失效',
  },
}

function peakInWindow(
  magnitudeDb: Float32Array,
  frequencies: Float32Array,
  centerHz: number,
  toleranceHz: number,
): { ampDb: number; freq: number } {
  let best = -Infinity
  let bestFreq = centerHz
  for (let i = 0; i < frequencies.length; i++) {
    const diff = Math.abs(frequencies[i] - centerHz)
    if (diff <= toleranceHz && magnitudeDb[i] > best) {
      best = magnitudeDb[i]
      bestFreq = frequencies[i]
    }
  }
  return { ampDb: best, freq: bestFreq }
}

function estimateNoiseFloor(
  magnitudeDb: Float32Array,
  excludeHz: number[],
  frequencies: Float32Array,
  guardHz: number,
): number {
  const samples: number[] = []
  for (let i = 0; i < frequencies.length; i++) {
    const f = frequencies[i]
    const excluded = excludeHz.some((ex) => Math.abs(f - ex) < guardHz)
    if (!excluded) samples.push(magnitudeDb[i])
  }
  if (samples.length === 0) return -80
  samples.sort((a, b) => a - b)
  // Use the 30th percentile as the noise floor to avoid outliers
  return samples[Math.floor(samples.length * 0.3)]
}

function snrToSeverity(
  snr: number,
  thresholds: Required<FaultClassifierConfig>['thresholds'],
): FaultSeverity {
  if (snr >= thresholds.critical) return 'critical'
  if (snr >= thresholds.warning) return 'warning'
  if (snr >= thresholds.watch) return 'watch'
  return 'none'
}

export function classifyBearingFaults(
  magnitudeDb: Float32Array,
  frequencies: Float32Array,
  geometry: BearingGeometry,
  config: FaultClassifierConfig = {},
): BearingFaultResult[] {
  const cfg = { ...DEFAULT_CONFIG, ...config }
  cfg.thresholds = { ...DEFAULT_CONFIG.thresholds, ...(config.thresholds ?? {}) }

  const binHz = frequencies.length > 1 ? frequencies[1] - frequencies[0] : 1
  const toleranceHz = binHz * cfg.toleranceFrac * 2

  const faultFreqs: Record<BearingFaultResult['faultType'], number> = {
    BPFO: geometry.bpfo,
    BPFI: geometry.bpfi,
    BSF: geometry.bsf,
    FTF: geometry.ftf,
  }

  // All fault frequencies across all harmonics — used to build noise floor mask
  const allFaultHz: number[] = []
  for (const [, baseHz] of Object.entries(faultFreqs)) {
    for (let h = 1; h <= cfg.harmonics; h++) allFaultHz.push(baseHz * h)
  }
  const noiseFloor = estimateNoiseFloor(magnitudeDb, allFaultHz, frequencies, toleranceHz * 3)

  const results: BearingFaultResult[] = []

  for (const [type, baseHz] of Object.entries(faultFreqs) as [BearingFaultResult['faultType'], number][]) {
    if (baseHz <= 0) continue
    const hits: FaultFrequencyHit[] = []

    for (let h = 1; h <= cfg.harmonics; h++) {
      const targetHz = baseHz * h
      if (targetHz > (frequencies[frequencies.length - 1] ?? 0)) break
      const { ampDb, freq } = peakInWindow(magnitudeDb, frequencies, targetHz, toleranceHz * h)
      if (ampDb > -Infinity) {
        const snr = ampDb - noiseFloor
        hits.push({ frequencyHz: freq, amplitudeDb: ampDb, harmonicOrder: h, snrDb: snr })
      }
    }

    if (hits.length === 0) {
      results.push({ ...FAULT_META[type], faultType: type, severity: 'none', snrDb: 0, hits: [] })
      continue
    }

    // Worst-case SNR drives the overall severity
    const maxSnr = Math.max(...hits.map((h) => h.snrDb))
    const severity = snrToSeverity(maxSnr, cfg.thresholds)

    results.push({
      ...FAULT_META[type],
      faultType: type,
      severity,
      snrDb: maxSnr,
      hits,
    })
  }

  return results
}

export function overallSeverity(results: BearingFaultResult[]): FaultSeverity {
  const rank: Record<FaultSeverity, number> = { none: 0, watch: 1, warning: 2, critical: 3 }
  let best: FaultSeverity = 'none'
  for (const r of results) {
    if (rank[r.severity] > rank[best]) best = r.severity
  }
  return best
}
