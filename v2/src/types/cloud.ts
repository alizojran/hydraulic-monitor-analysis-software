import type { PeakInfo } from './dsp'

export interface CloudBearingPayload {
  bpfiHz?: number
  bpfiDb?: number
  bpfoHz?: number
  bpfoDb?: number
  bsfHz?: number
  bsfDb?: number
  ftfHz?: number
  ftfDb?: number
  [key: string]: unknown
}

export interface CloudFftMessage {
  type: 'fft'
  deviceId: string
  seq?: number | null
  ts: number | string
  channelId: string
  sampleRate: number
  fftSize: number
  binHz: number
  rms?: number | null
  peak?: number | null
  peakValue?: number | null
  crestFactor?: number | null
  thd?: number | null
  mainFreq?: number | null
  mainAmpDb?: number | null
  peaks?: Array<Partial<PeakInfo> & { f?: number; db?: number; rank?: number }>
  bearing?: CloudBearingPayload
  spectrumDb?: number[] | null
  ch?: Record<string, number> | null
}

export interface CloudAlarmMessage {
  type: 'alarm'
  deviceId: string
  seq?: number | null
  ts: number | string
  channelId?: string | null
  severity?: string
  message?: string
  payload?: unknown
}

export interface CloudStatusMessage {
  type: 'status' | 'device_status' | 'heartbeat'
  deviceId?: string
  status?: string
  ts?: number | string
  payload?: unknown
}

export type CloudLiveMessage = CloudFftMessage | CloudAlarmMessage | CloudStatusMessage

export interface CloudHistoryResponse {
  deviceId: string
  rows: CloudFftMessage[]
}
