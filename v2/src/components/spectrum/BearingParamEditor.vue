<template>
  <div class="bpe">
    <!-- One section per bearing -->
    <div v-for="(bearing, idx) in dspStore.bearings" :key="bearing.id" class="bearing-section">
      <div class="bd-head">
        <input
          class="bearing-name-input"
          :value="bearing.name"
          @change="dspStore.setBearingName(($event.target as HTMLInputElement).value, idx)"
        />
        <span class="sub-label">{{ $t('spectrum.bearing') }}</span>
        <div class="spacer" />
        <button
          v-if="dspStore.bearings.length > 1"
          class="remove-btn"
          title="Remove"
          @click="dspStore.removeBearing(idx)"
        >
          ×
        </button>
        <button
          class="toggle"
          :class="{ on: bearing.overlay }"
          @click="dspStore.toggleBearingOverlay(idx)"
        >
          {{ bearing.overlay ? 'ON' : 'OFF' }}
        </button>
      </div>

      <div class="row">
        <span class="lbl">{{ $t('spectrum.model') }}</span>
        <select
          class="sel"
          :value="bearing.preset"
          @change="dspStore.setBearingPreset(($event.target as HTMLSelectElement).value, idx)"
        >
          <option v-for="p in BEARING_PRESETS" :key="p.name" :value="p.name">{{ p.name }}</option>
          <option value="Custom">Custom</option>
        </select>
      </div>
      <div v-if="idx === 0" class="row">
        <span class="lbl">{{ $t('spectrum.shaft') }}</span>
        <span class="val mono text-cyan">{{ Math.round(dspStore.bearingShaftRpm) }} RPM</span>
      </div>

      <div class="geom-grid">
        <label class="g-cell">
          <span class="lbl">Z</span>
          <input
            type="number"
            :value="bearing.params.ballCount"
            min="3"
            max="40"
            @input="
              dspStore.updateBearingParams(
                { ballCount: parseFloat(($event.target as HTMLInputElement).value) || 9 },
                idx,
              )
            "
          />
        </label>
        <label class="g-cell">
          <span class="lbl">Pd</span>
          <input
            type="number"
            :value="bearing.params.pitchDiamMm"
            step="0.1"
            min="5"
            max="500"
            @input="
              dspStore.updateBearingParams(
                { pitchDiamMm: parseFloat(($event.target as HTMLInputElement).value) || 39 },
                idx,
              )
            "
          />
        </label>
        <label class="g-cell">
          <span class="lbl">Bd</span>
          <input
            type="number"
            :value="bearing.params.ballDiamMm"
            step="0.01"
            min="1"
            max="50"
            @input="
              dspStore.updateBearingParams(
                { ballDiamMm: parseFloat(($event.target as HTMLInputElement).value) || 7 },
                idx,
              )
            "
          />
        </label>
        <label class="g-cell">
          <span class="lbl">α°</span>
          <input
            type="number"
            :value="bearing.params.contactAngleDeg"
            step="0.5"
            min="0"
            max="45"
            @input="
              dspStore.updateBearingParams(
                { contactAngleDeg: parseFloat(($event.target as HTMLInputElement).value) || 0 },
                idx,
              )
            "
          />
        </label>
      </div>
    </div>

    <button class="add-bearing-btn" @click="dspStore.addBearing()">
      + {{ $t('spectrum.addBearing') }}
    </button>
  </div>
</template>

<script setup lang="ts">
import { useDspStore, BEARING_PRESETS } from '@/stores/dsp'

const dspStore = useDspStore()
</script>

<style scoped>
.bpe {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.bearing-section {
  display: flex;
  flex-direction: column;
  gap: 5px;
}
.bearing-section + .bearing-section {
  border-top: 1px dashed var(--border);
  padding-top: 6px;
}
.bd-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-bottom: 3px;
  gap: 5px;
}
.bearing-name-input {
  font-size: 10px;
  color: var(--cyan);
  font-family: var(--font-mono);
  font-weight: 600;
  background: transparent;
  border: none;
  outline: none;
  width: 40px;
  border-bottom: 1px dashed var(--border);
}
.bearing-name-input:focus {
  border-bottom-color: var(--cyan);
}
.sub-label {
  font-size: 10px;
  color: var(--text-2);
  letter-spacing: 0.1em;
  text-transform: uppercase;
}
.spacer {
  flex: 1;
}
.remove-btn {
  font-size: 10px;
  padding: 1px 4px;
  background: transparent;
  border: 1px solid rgba(255, 51, 85, 0.3);
  border-radius: 2px;
  color: var(--red);
}
.toggle {
  font-family: var(--font-mono);
  font-size: 9px;
  padding: 1px 6px;
  border-radius: 2px;
  background: var(--bg-2);
  border: 1px solid var(--border);
  color: var(--text-2);
}
.toggle.on {
  background: rgba(0, 217, 255, 0.12);
  border-color: var(--cyan);
  color: var(--cyan);
}
.row {
  display: flex;
  align-items: center;
  gap: 6px;
  justify-content: space-between;
}
.lbl {
  font-size: 10px;
  color: var(--text-2);
  letter-spacing: 0.04em;
}
.val {
  font-size: 11px;
}
.sel {
  font-size: 11px;
  padding: 1px 4px;
  height: 22px;
  max-width: 130px;
}
.geom-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 4px;
}
.g-cell {
  display: flex;
  align-items: center;
  gap: 4px;
  background: var(--bg-2);
  border: 1px solid var(--border);
  border-radius: 2px;
  padding: 2px 6px;
}
.g-cell .lbl {
  min-width: 18px;
  font-family: var(--font-mono);
  font-size: 9.5px;
}
.g-cell input {
  flex: 1;
  min-width: 0;
  background: transparent;
  border: none;
  color: var(--text-1);
  font-family: var(--font-mono);
  font-size: 10.5px;
  padding: 0;
  outline: none;
}
.add-bearing-btn {
  font-size: 10px;
  padding: 3px 10px;
  margin-top: 2px;
  background: rgba(0, 217, 255, 0.06);
  border: 1px dashed rgba(0, 217, 255, 0.4);
  border-radius: 2px;
  color: var(--cyan);
  cursor: pointer;
}
.add-bearing-btn:hover {
  background: rgba(0, 217, 255, 0.12);
}
</style>
