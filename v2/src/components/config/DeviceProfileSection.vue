<template>
  <div class="cfg-section">
    <div class="sec-title">{{ $t('config.deviceProfile.staticTitle') }}</div>

    <div class="cfg-grid">
      <div class="cfg-row">
        <label>{{ $t('config.deviceProfile.deviceId') }}</label>
        <input v-model="profile.staticProfile.deviceId" type="text" />
      </div>
      <div class="cfg-row">
        <label>{{ $t('config.deviceProfile.brand') }}</label>
        <input v-model="profile.staticProfile.brand" type="text" />
      </div>
      <div class="cfg-row">
        <label>{{ $t('config.deviceProfile.model') }}</label>
        <input v-model="profile.staticProfile.model" type="text" />
      </div>
      <div class="cfg-row">
        <label>{{ $t('config.deviceProfile.installedAt') }}</label>
        <input v-model="profile.staticProfile.installedAt" type="date" />
      </div>
      <div class="cfg-row">
        <label>{{ $t('config.deviceProfile.ratedRpm') }}</label>
        <input v-model.number="profile.staticProfile.ratedRpm" type="number" min="0" />
      </div>
      <div class="cfg-row">
        <label>{{ $t('config.deviceProfile.ratedFlow') }}</label>
        <input v-model.number="profile.staticProfile.ratedFlowLpm" type="number" min="0" />
      </div>
      <div class="cfg-row">
        <label>{{ $t('config.deviceProfile.ratedPressure') }}</label>
        <input v-model.number="profile.staticProfile.ratedPressureBar" type="number" min="0" />
      </div>
      <div class="cfg-row">
        <label>{{ $t('config.deviceProfile.oilTemp') }}</label>
        <div class="dual-input">
          <input v-model.number="profile.staticProfile.oilTempMinC" type="number" />
          <span class="dim">–</span>
          <input v-model.number="profile.staticProfile.oilTempMaxC" type="number" />
          <span class="dim">°C</span>
        </div>
      </div>
      <div class="cfg-row">
        <label>{{ $t('config.deviceProfile.mounting') }}</label>
        <input v-model="profile.staticProfile.mountingOrientation" type="text" />
      </div>
      <div class="cfg-row">
        <label>{{ $t('config.deviceProfile.environment') }}</label>
        <input v-model="profile.staticProfile.environment" type="text" />
      </div>
      <div class="cfg-row">
        <label>{{ $t('config.deviceProfile.notes') }}</label>
        <textarea v-model="profile.staticProfile.notes" rows="2" />
      </div>
    </div>

    <!-- Bearings -->
    <div class="bearing-block">
      <div class="bb-head">
        <span class="sec-sub">{{ $t('config.deviceProfile.bearings') }}</span>
        <button class="add-btn" @click="addBearing">
          {{ $t('config.deviceProfile.addBearing') }}
        </button>
      </div>
      <table v-if="profile.staticProfile.bearings.length > 0" class="bearing-table">
        <thead>
          <tr>
            <th>{{ $t('config.deviceProfile.bearingPosition') }}</th>
            <th>{{ $t('config.deviceProfile.bearingModel') }}</th>
            <th>Z</th>
            <th>Pd</th>
            <th>Bd</th>
            <th>α°</th>
            <th>{{ $t('config.deviceProfile.installedAt') }}</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(b, idx) in profile.staticProfile.bearings" :key="idx">
            <td><input v-model="b.position" type="text" class="cell-in narrow" /></td>
            <td>
              <select :value="b.modelNumber" class="cell-in" @change="onPresetSelect(idx, $event)">
                <option value="">{{ b.modelNumber || '—' }}</option>
                <option v-for="p in BEARING_PRESETS" :key="p.name" :value="p.name">
                  {{ p.name }}
                </option>
              </select>
            </td>
            <td><input v-model.number="b.ballCount" type="number" class="cell-in tiny" /></td>
            <td><input v-model.number="b.pitchDiamMm" type="number" class="cell-in tiny" /></td>
            <td><input v-model.number="b.ballDiamMm" type="number" class="cell-in tiny" /></td>
            <td><input v-model.number="b.contactAngleDeg" type="number" class="cell-in tiny" /></td>
            <td><input v-model="b.installedAt" type="date" class="cell-in" /></td>
            <td><button class="x-btn" @click="removeBearing(idx)">×</button></td>
          </tr>
        </tbody>
      </table>
      <div v-else class="empty-hint">{{ $t('config.deviceProfile.noBearings') }}</div>
    </div>

    <div class="cfg-toolbar">
      <button @click="exportProfile">{{ $t('config.deviceProfile.exportProfile') }}</button>
      <button @click="triggerImport">{{ $t('config.deviceProfile.importProfile') }}</button>
      <input
        ref="importInput"
        type="file"
        accept=".json"
        style="display: none"
        @change="onImportFile"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useDeviceProfileStore } from '@/stores/deviceProfile'
import { BEARING_PRESETS } from '@/stores/bearingModel'
import type { DeviceBearingSpec } from '@/types/deviceProfile'

const profile = useDeviceProfileStore()
const importInput = ref<HTMLInputElement | null>(null)

function addBearing() {
  const next: DeviceBearingSpec = {
    position: profile.staticProfile.bearings.length === 0 ? 'DE' : 'NDE',
    modelNumber: '',
    ballDiamMm: 0,
    pitchDiamMm: 0,
    ballCount: 0,
    contactAngleDeg: 0,
  }
  profile.staticProfile.bearings.push(next)
}

function removeBearing(idx: number) {
  profile.staticProfile.bearings.splice(idx, 1)
}

function onPresetSelect(idx: number, ev: Event) {
  const name = (ev.target as HTMLSelectElement).value
  if (!name) return
  const preset = BEARING_PRESETS.find((p) => p.name === name)
  if (!preset) return
  const b = profile.staticProfile.bearings[idx]
  b.modelNumber = preset.name
  b.ballCount = preset.ballCount
  b.pitchDiamMm = preset.pitchDiamMm
  b.ballDiamMm = preset.ballDiamMm
  b.contactAngleDeg = preset.contactAngleDeg
}

function exportProfile() {
  const json = profile.exportProfile()
  const blob = new Blob([json], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `device-profile-${profile.staticProfile.deviceId || 'unnamed'}.json`
  a.click()
  URL.revokeObjectURL(url)
}

function triggerImport() {
  importInput.value?.click()
}

async function onImportFile(ev: Event) {
  const file = (ev.target as HTMLInputElement).files?.[0]
  if (!file) return
  try {
    profile.importProfile(await file.text())
  } catch (err) {
    alert('Import failed: ' + (err instanceof Error ? err.message : String(err)))
  }
}
</script>

<style scoped>
.cfg-section {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.sec-title {
  font-size: 10px;
  color: var(--text-2);
  letter-spacing: 0.1em;
  text-transform: uppercase;
  padding-bottom: 6px;
  border-bottom: 1px solid var(--border);
}
.sec-sub {
  font-size: 10px;
  color: var(--text-2);
  letter-spacing: 0.08em;
  text-transform: uppercase;
}
.cfg-grid {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.cfg-row {
  display: grid;
  grid-template-columns: 160px 1fr;
  align-items: center;
  gap: 12px;
  font-size: 12px;
  padding: 4px 0;
}
.cfg-row label {
  color: var(--text-2);
  font-size: 11px;
}
.cfg-row input,
.cfg-row textarea,
.cfg-row select {
  font-size: 12px;
  padding: 3px 6px;
  height: 26px;
  background: var(--bg-2);
  border: 1px solid var(--border);
  color: var(--text-0);
  border-radius: 2px;
  max-width: 320px;
  font-family: inherit;
}
.cfg-row textarea {
  height: auto;
  min-height: 50px;
  resize: vertical;
}
.dual-input {
  display: flex;
  align-items: center;
  gap: 6px;
}
.dual-input input {
  width: 70px;
}
.dim {
  color: var(--text-2);
  font-size: 11px;
}
.bearing-block {
  margin-top: 12px;
  border-top: 1px solid var(--border);
  padding-top: 10px;
}
.bb-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}
.add-btn {
  font-size: 11px;
  padding: 2px 10px;
  background: rgba(0, 217, 255, 0.08);
  border: 1px solid rgba(0, 217, 255, 0.3);
  border-radius: 2px;
  color: var(--cyan);
}
.bearing-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 11px;
}
.bearing-table th {
  text-align: left;
  font-weight: 500;
  color: var(--text-2);
  padding: 4px 6px;
  border-bottom: 1px solid var(--border);
  font-size: 10px;
  letter-spacing: 0.05em;
}
.bearing-table td {
  padding: 4px 6px;
  border-bottom: 1px solid var(--border);
}
.cell-in {
  width: 100%;
  font-size: 11px;
  padding: 2px 5px;
  height: 22px;
  background: var(--bg-2);
  border: 1px solid var(--border);
  color: var(--text-0);
  border-radius: 2px;
  font-family: inherit;
}
.cell-in.narrow {
  width: 60px;
}
.cell-in.tiny {
  width: 60px;
}
.x-btn {
  background: transparent;
  border: 1px solid var(--border);
  color: var(--text-2);
  width: 22px;
  height: 22px;
  border-radius: 2px;
  cursor: pointer;
  font-size: 14px;
}
.x-btn:hover {
  border-color: var(--red);
  color: var(--red);
}
.empty-hint {
  font-size: 11px;
  color: var(--text-2);
  padding: 6px 0;
}
.cfg-toolbar {
  display: flex;
  gap: 8px;
  margin-top: 6px;
  padding-top: 8px;
  border-top: 1px solid var(--border);
}
</style>
