export type WindowFunction = 'hamming' | 'hanning' | 'blackman' | 'flattop' | 'rect'

export type FftSize = 512 | 1024 | 2048 | 4096 | 8192

export interface FftConfig {
  fftSize: FftSize
  overlap: 0 | 0.25 | 0.5 | 0.75
  window: WindowFunction
  averages: 1 | 4 | 8 | 16 | 32
  sampleRate: number
}

export interface PeakInfo {
  frequency: number
  amplitudeDb: number
  binIndex: number
}

export interface FftResult {
  magnitudeDb: Float32Array
  magnitudeLinear: Float32Array
  frequencies: Float32Array
  binHz: number
  peaks: PeakInfo[]
  thd: number
  rms: number
  peakValue: number
  crestFactor: number
}

export interface OctaveBandResult {
  centerFrequencies: number[]
  magnitudeDb: Float32Array
  weighting: 'A' | 'C' | 'none'
}

export interface BearingGeometry {
  bpfi: number
  bpfo: number
  bsf: number
  ftf: number
}

export interface BearingParams {
  rpmHz: number
  ballCount: number
  pitchDiamMm: number
  ballDiamMm: number
  contactAngleDeg: number
}

export interface EnvelopeResult {
  spectrum: Float32Array
  frequencies: Float32Array
  bpfiAmplitude: number
  bpfoAmplitude: number
}
