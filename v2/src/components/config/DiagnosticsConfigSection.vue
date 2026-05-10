<template>
  <div class="cfg-section">
    <div class="sec-title">{{ $t('config.diagnostics.title') }}</div>

    <!-- One sub-card per bearing -->
    <div v-for="(bearing, idx) in dsp.bearings" :key="bearing.id" class="sub-card" :style="idx > 0 ? 'margin-top:8px' : ''">
      <div class="sub-head">
        <input class="name-input"
          :value="bearing.name"
          @change="dsp.setBearingName(($event.target as HTMLInputElement).value, idx)" />
        <span class="sub-label">{{ $t('config.diagnostics.bearing') }}</span>
        <div class="spacer" />
        <button v-if="dsp.bearings.length > 1" class="danger-sm" style="padding:1px 6px;margin-right:4px"
          @click="dsp.removeBearing(idx)">×</button>
        <div class="toggle-group">
          <button :class="{ active: bearing.overlay }" @click="!bearing.overlay && dsp.toggleBearingOverlay(idx)">ON</button>
          <button :class="{ active: !bearing.overlay }" @click="bearing.overlay && dsp.toggleBearingOverlay(idx)">OFF</button>
        </div>
      </div>

      <div class="cfg-grid">
        <div class="cfg-row">
          <label>{{ $t('config.diagnostics.preset') }}</label>
          <select :value="bearing.preset"
            @change="dsp.setBearingPreset(($event.target as HTMLSelectElement).value, idx)">
            <option v-for="p in BEARING_PRESETS" :key="p.name" :value="p.name">{{ p.name }}</option>
            <option value="Custom">Custom</option>
          </select>
        </div>

        <div class="cfg-row">
          <label>{{ $t('config.diagnostics.ballCount') }}</label>
          <div class="num-row">
            <input type="number" :value="bearing.params.ballCount" min="3" max="40" step="1"
              @input="dsp.updateBearingParams({ ballCount: parseFloat(($event.target as HTMLInputElement).value) || 9 }, idx)" />
          </div>
        </div>

        <div class="cfg-row">
          <label>{{ $t('config.diagnostics.pitchDiam') }}</label>
          <div class="num-row">
            <input type="number" :value="bearing.params.pitchDiamMm" min="5" max="500" step="0.1"
              @input="dsp.updateBearingParams({ pitchDiamMm: parseFloat(($event.target as HTMLInputElement).value) || 39 }, idx)" />
            <span class="unit">mm</span>
          </div>
        </div>

        <div class="cfg-row">
          <label>{{ $t('config.diagnostics.ballDiam') }}</label>
          <div class="num-row">
            <input type="number" :value="bearing.params.ballDiamMm" min="1" max="50" step="0.01"
              @input="dsp.updateBearingParams({ ballDiamMm: parseFloat(($event.target as HTMLInputElement).value) || 7 }, idx)" />
            <span class="unit">mm</span>
          </div>
        </div>

        <div class="cfg-row">
          <label>{{ $t('config.diagnostics.contactAngle') }}</label>
          <div class="num-row">
            <input type="number" :value="bearing.params.contactAngleDeg" min="0" max="45" step="0.5"
              @input="dsp.updateBearingParams({ contactAngleDeg: parseFloat(($event.target as HTMLInputElement).value) || 0 }, idx)" />
            <span class="unit">°</span>
          </div>
        </div>
      </div>

      <!-- Frequency preview chips -->
      <div class="freq-preview" v-if="dsp.allBearingFreqs[idx]">
        <span v-for="f in freqsFor(idx)" :key="f.label" class="freq-chip" :style="{ color: f.color }">
          {{ f.label }} {{ f.hz.toFixed(1) }} Hz
        </span>
      </div>
    </div>

    <!-- Add bearing button -->
    <button class="add-btn" @click="dsp.addBearing()">
      + {{ $t('config.diagnostics.addBearing') }}
    </button>

    <!-- Gear -->
    <div class="sub-card" style="margin-top: 10px;">
      <div class="sub-head">
        <span class="sub-label">{{ $t('config.diagnostics.gear') }}</span>
        <div class="spacer" />
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
import { useDspStore, BEARING_PRESETS, getBearingColorSet } from '@/stores/dsp'

const dsp = useDspStore()

function freqsFor(idx: number) {
  const b = dsp.allBearingFreqs[idx]
  if (!b) return []
  const cs = getBearingColorSet(idx)
  return [
    { label: 'BPFI', hz: b.freqs.bpfi, color: cs.BPFI },
    { label: 'BPFO', hz: b.freqs.bpfo, color: cs.BPFO },
    { label: 'BSF',  hz: b.freqs.bsf,  color: cs.BSF },
    { label: 'FTF',  hz: b.freqs.ftf,  color: cs.FTF },
  ]
}
</script>

<style scoped>
.cfg-section { display: flex; flex-direction: column; gap: 10px; }
.sec-title { font-size: 10px; color: var(--text-2); letter-spacing: 0.1em; text-transform: uppercase; padding-bottom: 6px; border-bottom: 1px solid var(--border); }

.sub-card { background: var(--bg-1); border: 1px solid var(--border); border-radius: 3px; padding: 10px 12px; }
.sub-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; gap: 6px; }
.sub-label { font-size: 10px; color: var(--text-2); letter-spacing: 0.1em; text-transform: uppercase; }
.spacer { flex: 1; }

.name-input {
  font-size: 11px; font-weight: 600; color: var(--cyan); font-family: var(--font-mono);
  background: transparent; border: none; border-bottom: 1px dashed var(--border);
  outline: none; width: 40px;
}
.name-input:focus { border-bottom-color: var(--cyan); }

.cfg-grid { display: flex; flex-direction: column; gap: 5px; }
.cfg-row {
  display: grid; grid-template-columns: 160px 1fr; align-items: center; gap: 12px;
  font-size: 12px; padding: 2px 0;
}
.cfg-row label { color: var(--text-2); font-size: 11px; }
.cfg-row select { font-size: 12px; padding: 3px 6px; height: 26px; min-width: 120px; max-width: 200px; }

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

.freq-preview { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 8px; padding-top: 8px; border-top: 1px solid var(--border); }
.freq-chip { font-family: var(--font-mono); font-size: 10.5px; }

.add-btn {
  font-size: 11px; padding: 5px 14px;
  background: rgba(0,217,255,0.06); border: 1px dashed rgba(0,217,255,0.4);
  border-radius: 2px; color: var(--cyan); cursor: pointer; text-align: center;
}
.add-btn:hover { background: rgba(0,217,255,0.12); }

.danger-sm {
  font-size: 11px; padding: 2px 8px;
  background: rgba(255,51,85,0.08); border: 1px solid rgba(255,51,85,0.35);
  border-radius: 2px; color: var(--red);
}

.mono { font-family: var(--font-mono); font-size: 12px; }
</style>
