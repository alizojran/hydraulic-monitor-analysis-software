import { defineStore } from 'pinia'
import { ref, computed, watch } from 'vue'
import { computeBearingFrequencies } from '@/dsp/bearing'
import { loadPersisted, savePersisted } from '@/utils/persistedStore'

export interface BearingPreset {
  name: string
  ballCount: number
  pitchDiamMm: number
  ballDiamMm: number
  contactAngleDeg: number
}

export interface BearingState {
  id: string
  name: string
  preset: string
  params: { ballCount: number; pitchDiamMm: number; ballDiamMm: number; contactAngleDeg: number }
  overlay: boolean
}

export const BEARING_PRESETS: BearingPreset[] = [
  { name: 'SKF 6205', ballCount: 9, pitchDiamMm: 39.04, ballDiamMm: 7.94, contactAngleDeg: 0 },
  { name: 'SKF 6206', ballCount: 9, pitchDiamMm: 46.4, ballDiamMm: 9.53, contactAngleDeg: 0 },
  { name: 'SKF 6308', ballCount: 8, pitchDiamMm: 65.0, ballDiamMm: 15.08, contactAngleDeg: 0 },
  { name: 'SKF 6310', ballCount: 8, pitchDiamMm: 80.0, ballDiamMm: 19.05, contactAngleDeg: 0 },
  { name: 'NSK 6204', ballCount: 8, pitchDiamMm: 33.5, ballDiamMm: 7.14, contactAngleDeg: 0 },
  { name: 'FAG 22320', ballCount: 14, pitchDiamMm: 145.0, ballDiamMm: 28.0, contactAngleDeg: 12 },
]

const BEARING_COLOR_SETS = [
  { BPFI: '#ff8800', BPFO: '#ff3355', BSF: '#00ff95', FTF: '#00d9ff' },
  { BPFI: '#ffcc00', BPFO: '#ff66aa', BSF: '#66ffbb', FTF: '#66eeff' },
]
export function getBearingColorSet(idx: number) {
  return BEARING_COLOR_SETS[idx % BEARING_COLOR_SETS.length]
}

const BEARING_KEY = 'daq-dsp-bearings'
const BEARING_VERSION = 2

const DEFAULT_BEARING_PARAMS = {
  ballCount: 9,
  pitchDiamMm: 39.04,
  ballDiamMm: 7.94,
  contactAngleDeg: 0,
}

interface BearingPersistedData {
  bearings?: BearingState[]
  gearTeeth?: number
  gearOverlay?: boolean
}

function migrateFromLegacyDspConfig(): BearingPersistedData {
  try {
    const raw = localStorage.getItem('daq-dsp-config')
    if (!raw) return {}
    const parsed = JSON.parse(raw) as unknown
    const data =
      typeof parsed === 'object' && parsed !== null && '_version' in parsed && 'data' in parsed
        ? (parsed as { data: unknown }).data
        : parsed
    if (typeof data !== 'object' || data === null) return {}
    const d = data as Record<string, unknown>
    const result: BearingPersistedData = {}
    if (Array.isArray(d.bearings)) result.bearings = d.bearings as BearingState[]
    if (typeof d.gearTeeth === 'number') result.gearTeeth = d.gearTeeth
    if (typeof d.gearOverlay === 'boolean') result.gearOverlay = d.gearOverlay
    return result
  } catch {
    return {}
  }
}

export const useBearingModelStore = defineStore('bearingModel', () => {
  const saved =
    loadPersisted<BearingPersistedData>({ key: BEARING_KEY, version: BEARING_VERSION }) ??
    migrateFromLegacyDspConfig()

  const bearings = ref<BearingState[]>(
    saved.bearings ?? [
      {
        id: 'b0',
        name: 'DE',
        preset: 'SKF 6205',
        params: { ...DEFAULT_BEARING_PARAMS },
        overlay: true,
      },
    ],
  )

  const bearingShaftRpm = ref(1500)
  const gearTeeth = ref<number>(saved.gearTeeth ?? 0)
  const gearOverlay = ref<boolean>(saved.gearOverlay ?? false)

  const allBearingFreqs = computed(() =>
    bearings.value.map((b, idx) => ({
      id: b.id,
      name: b.name,
      overlay: b.overlay,
      colorSet: getBearingColorSet(idx),
      freqs: computeBearingFrequencies({ rpmHz: bearingShaftRpm.value / 60, ...b.params }),
    })),
  )

  const gearFreqs = computed(() => {
    if (gearTeeth.value <= 0) return { mesh: 0, sb1: 0, sb2: 0 }
    const shaftHz = bearingShaftRpm.value / 60
    const mesh = gearTeeth.value * shaftHz
    return { mesh, sb1: mesh - shaftHz, sb2: mesh + shaftHz }
  })

  // Backward-compat single-bearing accessors
  const bearingPreset = computed(() => bearings.value[0]?.preset ?? 'SKF 6205')
  const bearingParams = computed(() => bearings.value[0]?.params ?? DEFAULT_BEARING_PARAMS)
  const bearingOverlay = computed(() => bearings.value[0]?.overlay ?? true)
  const bearingFreqs = computed(
    () => allBearingFreqs.value[0]?.freqs ?? { bpfi: 0, bpfo: 0, bsf: 0, ftf: 0 },
  )

  function setBearingShaftRpm(rpm: number) {
    bearingShaftRpm.value = rpm
  }

  function setBearingPreset(name: string, idx = 0) {
    if (!bearings.value[idx]) return
    bearings.value[idx].preset = name
    if (name !== 'Custom') {
      const p = BEARING_PRESETS.find((b) => b.name === name)
      if (p) {
        bearings.value[idx].params = {
          ballCount: p.ballCount,
          pitchDiamMm: p.pitchDiamMm,
          ballDiamMm: p.ballDiamMm,
          contactAngleDeg: p.contactAngleDeg,
        }
      }
    }
  }

  function updateBearingParams(partial: Partial<BearingState['params']>, idx = 0) {
    if (!bearings.value[idx]) return
    bearings.value[idx].params = { ...bearings.value[idx].params, ...partial }
    bearings.value[idx].preset = 'Custom'
  }

  function toggleBearingOverlay(idx = 0) {
    if (!bearings.value[idx]) return
    bearings.value[idx].overlay = !bearings.value[idx].overlay
  }

  function setBearingName(name: string, idx = 0) {
    if (!bearings.value[idx]) return
    bearings.value[idx].name = name
  }

  function addBearing() {
    const idx = bearings.value.length
    bearings.value.push({
      id: `b${Date.now()}`,
      name: idx === 1 ? 'NDE' : `BRG${idx + 1}`,
      preset: 'SKF 6205',
      params: { ...DEFAULT_BEARING_PARAMS },
      overlay: true,
    })
  }

  function removeBearing(idx: number) {
    if (bearings.value.length <= 1) return
    bearings.value.splice(idx, 1)
  }

  function setGearTeeth(z: number) {
    gearTeeth.value = Math.max(0, Math.floor(z))
  }

  function toggleGearOverlay() {
    gearOverlay.value = !gearOverlay.value
  }

  function setBearings(newBearings: BearingState[]) {
    bearings.value = newBearings
  }

  function setGearOverlay(val: boolean) {
    gearOverlay.value = val
  }

  // ─── Persistence ──────────────────────────────────────────────────────────
  let _saveTimer: ReturnType<typeof setTimeout> | null = null
  function _scheduleSave() {
    if (_saveTimer) clearTimeout(_saveTimer)
    _saveTimer = setTimeout(() => {
      savePersisted<BearingPersistedData>(
        { key: BEARING_KEY, version: BEARING_VERSION },
        {
          bearings: bearings.value,
          gearTeeth: gearTeeth.value,
          gearOverlay: gearOverlay.value,
        },
      )
    }, 300)
  }

  watch([bearings, gearTeeth, gearOverlay], _scheduleSave, { deep: true })

  return {
    bearings,
    bearingShaftRpm,
    gearTeeth,
    gearOverlay,
    allBearingFreqs,
    gearFreqs,
    bearingPreset,
    bearingParams,
    bearingOverlay,
    bearingFreqs,
    setBearingShaftRpm,
    setBearingPreset,
    updateBearingParams,
    toggleBearingOverlay,
    setBearingName,
    addBearing,
    removeBearing,
    setGearTeeth,
    toggleGearOverlay,
    setBearings,
    setGearOverlay,
  }
})
