export type ChannelType =
  | 'pressure'
  | 'temperature'
  | 'displacement'
  | 'flow'
  | 'particle'
  | 'rpm'
  | 'vibration'
  | 'acoustic'

export type WaveShape =
  | 'pressure'
  | 'square'
  | 'sine'
  | 'slow'
  | 'noise'
  | 'rpm'
  | 'vibration'
  | 'acoustic'

export interface ChannelDef {
  id: string
  nameZh: string
  nameEn: string
  short: string
  type: ChannelType
  unit: string
  min: number
  max: number
  hex: string
  wave: WaveShape
  // for sim: base value and variation range
  base?: number
  vary?: number
  // for vibration: characteristic frequencies
  freqs?: number[]
  // for rpm: nominal speed
  nominalRpm?: number
}

export interface SampleFrame {
  timestamp: number
  channels: Map<string, number>
}

export interface TimeWindowBufferState {
  points: number[]
  minPoints: number[]
  maxPoints: number[]
  filledCount: number
}
