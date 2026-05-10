import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { useConfigStore } from './config'
import { useDspStore } from './dsp'
import { useAlarmsStore } from './alarms'
import { useAcquisitionStore } from './acquisition'
import type { ChannelConfig, AcqConfig } from './config'
import type { AlarmRule } from '@/types/alarm'
import type { FftConfig } from '@/types/dsp'
import type { BearingState } from './dsp'
import { loadPersisted, savePersisted } from '@/utils/persistedStore'

export interface ProfileSnapshot {
  name: string
  createdAt: number
  channels: Record<string, ChannelConfig>
  acquisition: AcqConfig
  spectrum: {
    fftConfig: FftConfig
    octaveWeighting: 'A' | 'C' | 'none'
    envelopeMode: boolean
    xAxisMode: 'hz' | 'order'
    selectedChannelId: string
  }
  diagnostics: {
    bearings: BearingState[]
    gearTeeth: number
    gearOverlay: boolean
  }
  alarms: AlarmRule[]
  system: { locale: string; timeWindowSec: number }
}

export const DEFAULT_PROFILE_NAME = 'Default'
const PROFILES_KEY = 'daq-profiles'
const ACTIVE_KEY = 'daq-active-profile'
const PROFILES_VERSION = 2

export const useProfilesStore = defineStore('profiles', () => {
  const profiles = ref<ProfileSnapshot[]>(
    loadPersisted<ProfileSnapshot[]>({ key: PROFILES_KEY, version: PROFILES_VERSION }) ?? [],
  )
  const activeProfileName = ref<string>(localStorage.getItem(ACTIVE_KEY) ?? DEFAULT_PROFILE_NAME)
  const activeProfile = computed(
    () => profiles.value.find((p) => p.name === activeProfileName.value) ?? null,
  )

  function _save() {
    savePersisted({ key: PROFILES_KEY, version: PROFILES_VERSION }, profiles.value)
  }

  function setActive(name: string) {
    activeProfileName.value = name
    localStorage.setItem(ACTIVE_KEY, name)
  }

  function captureCurrentState(name: string): ProfileSnapshot {
    const cfg = useConfigStore()
    const dsp = useDspStore()
    const alarms = useAlarmsStore()
    const acq = useAcquisitionStore()

    return {
      name,
      createdAt: Date.now(),
      channels: JSON.parse(JSON.stringify(cfg.channels)),
      acquisition: { ...cfg.acquisition },
      spectrum: {
        fftConfig: { ...dsp.fftConfig },
        octaveWeighting: dsp.octaveWeighting,
        envelopeMode: dsp.envelopeMode,
        xAxisMode: dsp.xAxisMode,
        selectedChannelId: dsp.selectedChannelId,
      },
      diagnostics: {
        bearings: JSON.parse(JSON.stringify(dsp.bearings)),
        gearTeeth: dsp.gearTeeth,
        gearOverlay: dsp.gearOverlay,
      },
      alarms: JSON.parse(JSON.stringify(alarms.rules)),
      system: {
        locale: localStorage.getItem('daq-locale') ?? 'zh',
        timeWindowSec: acq.timeWindowSec,
      },
    }
  }

  // Returns the locale string from the profile so the caller can apply it via i18n
  function applyProfile(profile: ProfileSnapshot): string {
    const cfg = useConfigStore()
    const dsp = useDspStore()
    const alarms = useAlarmsStore()
    const acq = useAcquisitionStore()

    cfg.setChannels(JSON.parse(JSON.stringify(profile.channels)))
    cfg.updateAcq(profile.acquisition)

    dsp.setFftConfig(profile.spectrum.fftConfig)
    dsp.setOctaveWeighting(profile.spectrum.octaveWeighting)
    dsp.setEnvelopeMode(profile.spectrum.envelopeMode)
    dsp.setXAxisMode(profile.spectrum.xAxisMode)
    dsp.setSelectedChannel(profile.spectrum.selectedChannelId)
    dsp.setBearings(JSON.parse(JSON.stringify(profile.diagnostics.bearings)))
    dsp.setGearTeeth(profile.diagnostics.gearTeeth)
    dsp.setGearOverlay(profile.diagnostics.gearOverlay)

    alarms.setRules(JSON.parse(JSON.stringify(profile.alarms)))
    acq.setTimeWindow(profile.system.timeWindowSec)

    return profile.system.locale
  }

  function saveToActive() {
    const snap = captureCurrentState(activeProfileName.value)
    upsertProfile(snap)
  }

  function upsertProfile(data: ProfileSnapshot) {
    const idx = profiles.value.findIndex((p) => p.name === data.name)
    if (idx >= 0) {
      profiles.value[idx] = data
    } else {
      profiles.value.push(data)
    }
    _save()
  }

  function deleteProfile(name: string) {
    if (name === DEFAULT_PROFILE_NAME) return
    profiles.value = profiles.value.filter((p) => p.name !== name)
    if (activeProfileName.value === name) setActive(DEFAULT_PROFILE_NAME)
    _save()
  }

  function cloneProfile(sourceName: string, newName: string) {
    const src = profiles.value.find((p) => p.name === sourceName)
    if (!src) return
    upsertProfile({ ...JSON.parse(JSON.stringify(src)), name: newName, createdAt: Date.now() })
    setActive(newName)
  }

  function exportProfile(name: string): string {
    const p = profiles.value.find((x) => x.name === name)
    if (!p) throw new Error('Profile not found')
    return JSON.stringify(p, null, 2)
  }

  function exportAll(): string {
    return JSON.stringify({ profiles: profiles.value, active: activeProfileName.value }, null, 2)
  }

  function importProfile(json: string) {
    const data = JSON.parse(json) as ProfileSnapshot
    if (!data.name) throw new Error('Invalid profile')
    upsertProfile(data)
    setActive(data.name)
  }

  return {
    profiles,
    activeProfileName,
    activeProfile,
    setActive,
    upsertProfile,
    deleteProfile,
    cloneProfile,
    captureCurrentState,
    applyProfile,
    saveToActive,
    exportProfile,
    exportAll,
    importProfile,
  }
})
