import type { FftConfig } from '@/types/dsp'
import type { AlarmRule } from '@/types/alarm'

export const DEFAULT_FFT_CONFIG: FftConfig = {
  fftSize: 2048,
  overlap: 0.5,
  window: 'hanning',
  averages: 4,
  sampleRate: 10000,
}

export const DEFAULT_ALARM_RULES: AlarmRule[] = [
  {
    id: 'r1',
    channelId: 'CH01',
    metric: 'value',
    operator: '>',
    threshold: 260,
    severity: 'high',
    enabled: true,
    label: 'CH01 高压报警',
  },
  {
    id: 'r2',
    channelId: 'CH02',
    metric: 'value',
    operator: '>',
    threshold: 240,
    severity: 'warn',
    enabled: true,
    label: 'CH02 超压警告',
  },
  {
    id: 'r3',
    channelId: 'CH06',
    metric: 'value',
    operator: '>',
    threshold: 75,
    severity: 'warn',
    enabled: true,
    label: 'CH06 高温警告',
  },
  {
    id: 'r4',
    channelId: 'CH05',
    metric: 'value',
    operator: '>',
    threshold: 70,
    severity: 'low',
    enabled: true,
    label: 'CH05 温度提示',
  },
  {
    id: 'r5',
    channelId: 'V02',
    metric: 'rms',
    operator: '>',
    threshold: 1.5,
    severity: 'warn',
    enabled: true,
    label: 'V02 振动超限',
  },
]
