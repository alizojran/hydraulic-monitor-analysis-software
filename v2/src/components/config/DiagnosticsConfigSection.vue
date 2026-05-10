<template>
  <div class="cfg-section">
    <div class="sec-title">{{ $t('config.diagnostics.title') }}</div>

    <!-- Bearing -->
    <div class="sub-card">
      <div class="sub-head">
        <span class="sub-label">{{ $t('config.diagnostics.bearing') }}</span>
        <div class="toggle-group">
          <button :class="{ active: dsp.bearingOverlay }" @click="!dsp.bearingOverlay && dsp.toggleBearingOverlay()">ON</button>
          <button :class="{ active: !dsp.bearingOverlay }" @click="dsp.bearingOverlay && dsp.toggleBearingOverlay()">OFF</button>
        </div>
      </div>

      <div class="cfg-grid">
        <div class="cfg-row">
          <label>{{ $t('config.diagnostics.preset') }}</label>
          <select :value="dsp.bearingPreset" @change="onPresetChange">
            <option v-for="p in BEARING_PRESETS" :key="p.name" :value="p.name">{{ p.name }}</option>
            <option value="Custom">Custom</option>
          </select>
        </div>

        <div class="cfg-row">
          <label>{{ $t('config.diagnostics.ballCount') }}</label>
          <div class="num-row">
            <input type="number" :value="dsp.bearingParams.ballCount" min="3" max="40" step="1"
              @input="onParam('ballCount', $event)" />
          </div>
        </div>

        <div class="cfg-row">
          <label>{{ $t('config.diagnostics.pitchDiam') }}</label>
          <div class="num-row">
            <input type="number" :value="dsp.bearingParams.pitchDiamMm" min="5" max="500" step="0.1"
              @input="onParam('pitchDiamMm', $event)" />
            <span class="unit">mm</span>
          </div>
        </div>

        <div class="cfg-row">
          <label>{{ $t('config.diagnostics.ballDiam') }}</label>
          <div class="num-row">
            <input type="number" :value="dsp.bearingParams.ballDiamMm" min="1" max="50" step="0.01"
              @input="onParam('ballDiamMm', $event)" />
            <span class="unit">mm</span>
          </div>
        </div>

        <div class="cfg-row">
          <label>{{ $t('config.diagnostics.contactAngle') }}</label>
          <div class="num-row">
            <input type="number" :value="dsp.bearingParams.contactAngleDeg" min="0" max="45" step="0.5"
              @input="onParam('contactAngleDeg', $event)" />
            <span class="unit">°</span>
          </div>
        </div>
      </div>

      <!-- Computed freq preview -->
      <div class="freq-preview">
        <span v-for="f in freqPreview" :key="f.label" class="freq-chip" :style="{ color: f.color }">
          {{ f.label }} {{ f.hz.toFixed(1) }} Hz
        </span>
      </div>
    </div>

    <!-- Gear -->
    <div class="sub-card" style="margin-top: 10px;">
      <div class="sub-head">
        <span class="sub-label">{{ $t('config.diagnostics.gear') }}</span>
        <div class="toggle-group">
          <button :class="{ active: dsp.gearOverlay }" :disabled="dsp.gearTeeth <= 0"
            @click="!dsp.gearOverlay && dsp.toggleGearOverlay()">ON</button>
          <button :class="{ active: !dsp.gearOverlay }" :disabled="dsp.gearTeeth <= 0"
            @click="dsp.gearOverlay && dsp.toggleGearOverlay()">OFF</button>
        </div>
      </div>

      <div class="cfg-grid">
        <div class="cfg-row">
          <label>{{ $t('config.diagnostics.gearTeeth') }}</label>
          <div class="num-row">
            <input type="number" :value="dsp.gearTeeth" min="0" max="200" step="1"
              @input="dsp.setGearTeeth(parseInt(($event.target as HTMLInputElement).value) || 0)" />
            <span class="unit dim">Z</span>
          </div>
        </div>

        <div v-if="dsp.gearTeeth > 0" class="cfg-row">
          <label style="color: var(--purple)">GMF</label>
          <span class="mono" style="color: var(--purple)">{{ dsp.gearFreqs.mesh.toFixed(1) }} Hz</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useDspStore, BEARING_PRESETS } from '@/stores/dsp'

const dsp = useDspStore()

const COLORS: Record<string, string> = { BPFI: '#ff8800', BPFO: '#ff3355', BSF: '#00ff95', FTF: '#00d9ff' }

const freqPreview = computed(() => {
  const f = dsp.bearingFreqs
  return [
    { label: 'BPFI', hz: f.bpfi, color: COLORS.BPFI },
    { label: 'BPFO', hz: f.bpfo, color: COLORS.BPFO },
    { label: 'BSF',  hz: f.bsf,  color: COLORS.BSF },
    { label: 'FTF',  hz: f.ftf,  color: COLORS.FTF },
  ]
})

function onPresetChange(e: Event) {
  const name = (e.target as HTMLSelectElement).value
  if (name === 'Custom') {
    dsp.bearingPreset = 'Custom'
  } else {
    dsp.setBearingPreset(name)
  }
}

function onParam(key: 'ballCount' | 'pitchDiamMm' | 'ballDiamMm' | 'contactAngleDeg', e: Event) {
  const v = parseFloat((e.target as HTMLInputElement).value)
  if (!Number.isNaN(v)) dsp.updateBearingParams({ [key]: v })
}
</script>

<style scoped>
.cfg-section { display: flex; flex-direction: column; gap: 10px; }
.sec-title { font-size: 10px; color: var(--text-2); letter-spacing: 0.1em; text-transform: uppercase; padding-bottom: 6px; border-bottom: 1px solid var(--border); }

.sub-card { background: var(--bg-1); border: 1px solid var(--border); border-radius: 3px; padding: 10px 12px; }
.sub-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
.sub-label { font-size: 10px; color: var(--text-2); letter-spacing: 0.1em; text-transform: uppercase; }

.cfg-grid { display: flex; flex-direction: column; gap: 5px; }
.cfg-row {
  display: grid; grid-template-columns: 160px 1fr; align-items: center; gap: 12px;
  font-size: 12px; padding: 2px 0;
}
.cfg-row label { color: var(--text-2); font-size: 11px; }

.num-row { display: flex; align-items: center; gap: 5px; }
.num-row input {
  width: 90px; background: var(--bg-2); border: 1px solid var(--border);
  border-radius: 2px; padding: 3px 8px; color: var(--text-1);
  font-family: var(--font-mono); font-size: 12px; outline: none;
}
.num-row input:focus { border-color: var(--cyan); }
.unit { font-size: 11px; color: var(--text-2); }
.unit.dim { color: var(--text-3); }

.toggle-group { display: flex; gap: 3px; }
.toggle-group button {
  padding: 2px 10px; font-size: 11px; font-family: var(--font-mono);
  background: var(--bg-2); border: 1px solid var(--border); border-radius: 2px; color: var(--text-2);
}
.toggle-group button.active { background: rgba(0,217,255,0.12); border-color: var(--cyan); color: var(--cyan); }
.toggle-group button:disabled { opacity: 0.35; cursor: not-allowed; }

.freq-preview {
  display: flex; flex-wrap: wrap; gap: 8px;
  margin-top: 8px; padding-top: 8px; border-top: 1px solid var(--border);
}
.freq-chip { font-family: var(--font-mono); font-size: 10.5px; }
.mono { font-family: var(--font-mono); font-size: 12px; }
</style>
