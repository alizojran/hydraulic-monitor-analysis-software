import type { ChannelDef } from '@/types/channel'

export const DISPLAY_POINTS = 600

export const CHANNEL_DEFS: ChannelDef[] = [
  // Analog pressure/temp/displacement channels
  { id: 'CH01', nameZh: '主泵出口压力', nameEn: 'Main Pump Outlet', short: 'P1', type: 'pressure',     unit: 'bar', min: 0,    max: 300,  hex: '#00ff95', wave: 'pressure', base: 182, vary: 14 },
  { id: 'CH02', nameZh: '系统A压力',    nameEn: 'System A Pressure', short: 'P2', type: 'pressure',    unit: 'bar', min: 0,    max: 300,  hex: '#00ff95', wave: 'pressure', base: 165, vary: 9  },
  { id: 'CH03', nameZh: '系统B压力',    nameEn: 'System B Pressure', short: 'P3', type: 'pressure',    unit: 'bar', min: 0,    max: 250,  hex: '#00ff95', wave: 'square',   base: 142, vary: 22 },
  { id: 'CH04', nameZh: '回油压力',     nameEn: 'Return Pressure',   short: 'P4', type: 'pressure',    unit: 'bar', min: 0,    max: 50,   hex: '#00ff95', wave: 'noise',    base: 14,  vary: 4.5},
  { id: 'CH05', nameZh: '油箱温度',     nameEn: 'Tank Temperature',  short: 'T1', type: 'temperature', unit: '°C',  min: 0,    max: 100,  hex: '#ffaa00', wave: 'slow',     base: 52,  vary: 0.4},
  { id: 'CH06', nameZh: '冷却回油温度', nameEn: 'Cooler Return Temp',short: 'T2', type: 'temperature', unit: '°C',  min: 0,    max: 100,  hex: '#ffaa00', wave: 'slow',     base: 68,  vary: 0.6},
  { id: 'CH07', nameZh: '1#油缸位移',   nameEn: 'Cylinder 1 Pos',    short: 'X1', type: 'displacement',unit: 'mm',  min: -100, max: 100,  hex: '#b366ff', wave: 'sine',     base: 0,   vary: 55 },
  { id: 'CH08', nameZh: '2#油缸位移',   nameEn: 'Cylinder 2 Pos',    short: 'X2', type: 'displacement',unit: 'mm',  min: -25,  max: 25,   hex: '#b366ff', wave: 'sine',     base: 0,   vary: 18 },
  // Flow
  { id: 'F01',  nameZh: '主管路流量',   nameEn: 'Main Flow Rate',    short: 'Q1', type: 'flow',        unit: 'L/min',min: 0,   max: 200,  hex: '#00d9ff', wave: 'pressure', base: 120, vary: 6  },
  // Particle (ISO 4406) — value = contamination code index 0..15
  { id: 'F02',  nameZh: '油液颗粒度',   nameEn: 'Particle Count',    short: 'PC', type: 'particle',    unit: 'ISO',  min: 0,   max: 15,   hex: '#b366ff', wave: 'slow',     base: 7,   vary: 1  },
  // RPM tachometer
  { id: 'V01',  nameZh: '电机转速',     nameEn: 'Motor Speed',       short: 'N',  type: 'rpm',         unit: 'RPM',  min: 0,   max: 2400, hex: '#00d9ff', wave: 'rpm',      base: 1500,vary: 30, nominalRpm: 1500 },
  // Vibration (acceleration)
  { id: 'V02',  nameZh: '电机振动 Y',   nameEn: 'Motor Vibration Y', short: 'Vy', type: 'vibration',   unit: 'g',    min: -3,  max: 3,    hex: '#ff3355', wave: 'vibration', base: 0, vary: 0.8, freqs: [25, 50, 100, 200, 400] },
  // Acoustic
  { id: 'S01',  nameZh: '声学采集',     nameEn: 'Acoustic',          short: 'dB', type: 'acoustic',    unit: 'dBSPL',min: 40,  max: 120,  hex: '#ffe600', wave: 'acoustic',  base: 72, vary: 5  },
]

export const CHANNEL_MAP = new Map(CHANNEL_DEFS.map(ch => [ch.id, ch]))

export const ANALOG_CHANNELS  = CHANNEL_DEFS.filter(c => c.type === 'pressure' || c.type === 'temperature' || c.type === 'displacement')
export const FLOW_CHANNELS    = CHANNEL_DEFS.filter(c => c.type === 'flow' || c.type === 'particle')
export const VIB_CHANNELS     = CHANNEL_DEFS.filter(c => c.type === 'vibration' || c.type === 'rpm')
export const ACOUSTIC_CHANNEL = CHANNEL_DEFS.find(c => c.type === 'acoustic')!

export const TIME_WINDOWS = [
  { label: '1 min',  labelZh: '1 分钟',  value: 60 },
  { label: '5 min',  labelZh: '5 分钟',  value: 300 },
  { label: '15 min', labelZh: '15 分钟', value: 900 },
  { label: '30 min', labelZh: '30 分钟', value: 1800 },
  { label: '1 hr',   labelZh: '1 小时',  value: 3600 },
]
