import { defineStore } from 'pinia'
import { ref } from 'vue'
import { CHANNEL_DEFS } from '@/config/channels'

export interface ChannelConfig {
  id: string
  enabled: boolean
  name: string
  coupling: 'DC' | 'AC' | 'IEPE'
  rangeMin: number
  rangeMax: number
  unit: string
  filter: string
}

export interface AcqConfig {
  sampleRate: number
  triggerType: 'edge-rising' | 'edge-falling' | 'window' | 'software'
  triggerChannel: string
  triggerLevel: number
  preTriggerPct: number
  postTriggerPct: number
}

function makeDefaultChannelConfigs(): Record<string, ChannelConfig> {
  return Object.fromEntries(CHANNEL_DEFS.map(ch => [ch.id, {
    id: ch.id,
    enabled: true,
    name: ch.nameZh,
    coupling: ch.type === 'vibration' || ch.type === 'acoustic' ? 'IEPE' : 'DC',
    rangeMin: ch.min,
    rangeMax: ch.max,
    unit: ch.unit,
    filter: ch.type === 'temperature' ? 'LP 10Hz' : ch.type === 'vibration' ? 'LP 10kHz' : 'LP 5kHz',
  }]))
}

function loadFromStorage<T>(key: string, fallback: T): T {
  try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback } catch { return fallback }
}

export const useConfigStore = defineStore('config', () => {
  const channels = ref<Record<string, ChannelConfig>>(
    loadFromStorage('daq-channel-config', makeDefaultChannelConfigs())
  )
  const acquisition = ref<AcqConfig>(loadFromStorage('daq-acq-config', {
    sampleRate: 10000,
    triggerType: 'software',
    triggerChannel: 'CH01',
    triggerLevel: 200,
    preTriggerPct: 10,
    postTriggerPct: 90,
  }))

  function saveChannels() { localStorage.setItem('daq-channel-config', JSON.stringify(channels.value)) }
  function saveAcq() { localStorage.setItem('daq-acq-config', JSON.stringify(acquisition.value)) }

  function updateChannel(id: string, patch: Partial<ChannelConfig>) {
    if (channels.value[id]) { channels.value[id] = { ...channels.value[id], ...patch }; saveChannels() }
  }

  function updateAcq(patch: Partial<AcqConfig>) {
    acquisition.value = { ...acquisition.value, ...patch }
    saveAcq()
  }

  function resetDefaults() {
    channels.value = makeDefaultChannelConfigs()
    saveChannels()
  }

  function setChannels(ch: Record<string, ChannelConfig>) {
    channels.value = ch
    saveChannels()
  }

  function exportConfig(): string {
    return JSON.stringify({ channels: channels.value, acquisition: acquisition.value }, null, 2)
  }

  function importConfig(json: string) {
    const data = JSON.parse(json)
    if (data.channels) { channels.value = data.channels; saveChannels() }
    if (data.acquisition) { acquisition.value = data.acquisition; saveAcq() }
  }

  return { channels, acquisition, updateChannel, updateAcq, resetDefaults, setChannels, exportConfig, importConfig }
})
