<template>
  <div class="bd-panel">
    <!-- One section per bearing -->
    <div v-for="(bearing, idx) in dspStore.bearings" :key="bearing.id" class="bearing-section">
      <div class="bd-head">
        <input class="bearing-name-input" :value="bearing.name"
          @change="dspStore.setBearingName(($event.target as HTMLInputElement).value, idx)" />
        <span class="sub-label">{{ locale === 'zh' ? '轴承' : 'BEARING' }}</span>
        <div class="spacer" />
        <button v-if="dspStore.bearings.length > 1" class="remove-btn" @click="dspStore.removeBearing(idx)" title="Remove">×</button>
        <button class="toggle" :class="{ on: bearing.overlay }" @click="dspStore.toggleBearingOverlay(idx)">
          {{ bearing.overlay ? 'ON' : 'OFF' }}
        </button>
      </div>

      <!-- Preset / source RPM -->
      <div class="row">
        <span class="lbl">{{ locale === 'zh' ? '型号' : 'Model' }}</span>
        <select class="sel" :value="bearing.preset" @change="dspStore.setBearingPreset(($event.target as HTMLSelectElement).value, idx)">
          <option v-for="p in BEARING_PRESETS" :key="p.name" :value="p.name">{{ p.name }}</option>
          <option value="Custom">Custom</option>
        </select>
      </div>
      <div v-if="idx === 0" class="row">
        <span class="lbl">{{ locale === 'zh' ? '转速' : 'Shaft' }}</span>
        <span class="val mono text-cyan">{{ Math.round(dspStore.bearingShaftRpm) }} RPM</span>
      </div>

      <!-- Geometry inputs -->
      <div class="geom-grid">
        <label class="g-cell">
          <span class="lbl">Z</span>
          <input type="number" :value="bearing.params.ballCount" min="3" max="40"
            @input="dspStore.updateBearingParams({ ballCount: parseFloat(($event.target as HTMLInputElement).value) || 9 }, idx)" />
        </label>
        <label class="g-cell">
          <span class="lbl">Pd</span>
          <input type="number" :value="bearing.params.pitchDiamMm" step="0.1" min="5" max="500"
            @input="dspStore.updateBearingParams({ pitchDiamMm: parseFloat(($event.target as HTMLInputElement).value) || 39 }, idx)" />
        </label>
        <label class="g-cell">
          <span class="lbl">Bd</span>
          <input type="number" :value="bearing.params.ballDiamMm" step="0.01" min="1" max="50"
            @input="dspStore.updateBearingParams({ ballDiamMm: parseFloat(($event.target as HTMLInputElement).value) || 7 }, idx)" />
        </label>
        <label class="g-cell">
          <span class="lbl">α°</span>
          <input type="number" :value="bearing.params.contactAngleDeg" step="0.5" min="0" max="45"
            @input="dspStore.updateBearingParams({ contactAngleDeg: parseFloat(($event.target as HTMLInputElement).value) || 0 }, idx)" />
        </label>
      </div>

      <!-- Computed fault frequencies + spectrum amplitude readout -->
      <div class="freq-list" v-if="dspStore.allBearingFreqs[idx]">
        <div v-for="f in faultFreqsFor(idx)" :key="f.label" class="freq-row" :class="{ alarm: f.amplitude > -25 }">
          <span class="dot" :style="{ background: f.color }" />
          <span class="freq-name mono">{{ f.label }}</span>
          <span class="freq-hz mono">{{ f.hz.toFixed(1) }} Hz</span>
          <span class="freq-amp mono" :style="{ color: f.color }">{{ formatDb(f.amplitude) }} dB</span>
        </div>
      </div>

      <!-- Diagnosis hint -->
      <div class="diag" :class="diagnosisFor(idx).cls">
        <span class="diag-icon">{{ diagnosisFor(idx).icon }}</span>
        <span class="diag-text">{{ diagnosisFor(idx).text }}</span>
      </div>
    </div>

    <!-- Add bearing button -->
    <button class="add-bearing-btn" @click="dspStore.addBearing()">
      + {{ locale === 'zh' ? '添加轴承' : 'Add Bearing' }}
    </button>

    <!-- Gear sub-section -->
    <div class="bd-head" style="margin-top:6px;border-top:1px dashed var(--border);padding-top:6px">
      <span class="title">{{ locale === 'zh' ? '齿轮' : 'GEAR' }}</span>
      <button class="toggle" :class="{ on: dspStore.gearOverlay }"
        :disabled="dspStore.gearTeeth <= 0"
        @click="dspStore.toggleGearOverlay">
        {{ dspStore.gearOverlay ? 'ON' : 'OFF' }}
      </button>
    </div>
    <div class="row">
      <span class="lbl">{{ locale === 'zh' ? '齿数 Z' : 'Teeth Z' }}</span>
      <input class="inline-num" type="number" min="0" max="200"
        :value="dspStore.gearTeeth"
        @input="dspStore.setGearTeeth(parseInt(($event.target as HTMLInputElement).value) || 0)" />
    </div>
    <div v-if="dspStore.gearTeeth > 0" class="row">
      <span class="lbl mono" style="color: var(--purple)">GMF</span>
      <span class="val mono text-purple">{{ dspStore.gearFreqs.mesh.toFixed(1) }} Hz</span>
    </div>
    <div v-if="dspStore.gearTeeth > 0" class="row">
      <span class="lbl mono text-dim">±SB</span>
      <span class="val mono text-dim">{{ dspStore.gearFreqs.sb1.toFixed(1) }} / {{ dspStore.gearFreqs.sb2.toFixed(1) }} Hz</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, watchEffect } from 'vue'
import { useDspStore, BEARING_PRESETS, getBearingColorSet } from '@/stores/dsp'
import { useAcquisitionStore } from '@/stores/acquisition'
import { useI18n } from 'vue-i18n'

const { locale } = useI18n()
const dspStore = useDspStore()
const acqStore = useAcquisitionStore()

// Track shaft RPM from V01
watchEffect(() => {
  const rpm = acqStore.channelValues['V01'] ?? 1500
  dspStore.setBearingShaftRpm(rpm)
})

function faultFreqsFor(idx: number) {
  const b = dspStore.allBearingFreqs[idx]
  if (!b) return []
  const cs = getBearingColorSet(idx)
  return [
    { label: 'BPFI', hz: b.freqs.bpfi, amplitude: amplitudeAt(b.freqs.bpfi), color: cs.BPFI },
    { label: 'BPFO', hz: b.freqs.bpfo, amplitude: amplitudeAt(b.freqs.bpfo), color: cs.BPFO },
    { label: 'BSF',  hz: b.freqs.bsf,  amplitude: amplitudeAt(b.freqs.bsf),  color: cs.BSF },
    { label: 'FTF',  hz: b.freqs.ftf,  amplitude: amplitudeAt(b.freqs.ftf),  color: cs.FTF },
  ]
}

function amplitudeAt(hz: number): number {
  const res = dspStore.fftResult
  if (!res || hz <= 0) return -120
  const bin = Math.round(hz / res.binHz)
  if (bin < 0 || bin >= res.magnitudeDb.length) return -120
  return res.magnitudeDb[bin]
}

function formatDb(v: number): string {
  if (!Number.isFinite(v) || v <= -120) return '—'
  return v.toFixed(1)
}

function diagnosisFor(idx: number) {
  const freqs = faultFreqsFor(idx)
  const elevated = freqs.filter(x => x.amplitude > -30).sort((a, b) => b.amplitude - a.amplitude)
  if (elevated.length === 0) {
    return { icon: '✓', cls: 'ok', text: locale.value === 'zh' ? '无明显故障特征' : 'No fault signature detected' }
  }
  const top = elevated[0]
  return {
    icon: '⚠',
    cls: top.amplitude > -20 ? 'high' : 'warn',
    text: locale.value === 'zh'
      ? `${top.label} 故障特征 · ${top.amplitude.toFixed(0)} dB`
      : `${top.label} fault signature · ${top.amplitude.toFixed(0)} dB`,
  }
}
</script>

<style scoped>
.bd-panel {
  display: flex; flex-direction: column; gap: 6px;
  padding: 8px; font-size: 11px;
  border-top: 1px solid var(--border);
}
.bearing-section { display: flex; flex-direction: column; gap: 5px; }
.bearing-section + .bearing-section { border-top: 1px dashed var(--border); padding-top: 6px; }

.bd-head {
  display: flex; justify-content: space-between; align-items: center;
  padding-bottom: 3px; gap: 5px;
}
.bearing-name-input {
  font-size: 10px; color: var(--cyan); font-family: var(--font-mono); font-weight: 600;
  background: transparent; border: none; outline: none; width: 40px;
  border-bottom: 1px dashed var(--border);
}
.bearing-name-input:focus { border-bottom-color: var(--cyan); }
.sub-label { font-size: 10px; color: var(--text-2); letter-spacing: 0.1em; text-transform: uppercase; }
.spacer { flex: 1; }
.title { font-size: 10px; color: var(--text-2); letter-spacing: 0.12em; text-transform: uppercase; }
.remove-btn {
  font-size: 10px; padding: 1px 4px; background: transparent;
  border: 1px solid rgba(255,51,85,0.3); border-radius: 2px; color: var(--red);
}
.toggle {
  font-family: var(--font-mono); font-size: 9px;
  padding: 1px 6px; border-radius: 2px;
  background: var(--bg-2); border: 1px solid var(--border); color: var(--text-2);
}
.toggle.on { background: rgba(0,217,255,0.12); border-color: var(--cyan); color: var(--cyan); }

.row { display: flex; align-items: center; gap: 6px; justify-content: space-between; }
.lbl { font-size: 10px; color: var(--text-2); letter-spacing: 0.04em; }
.val { font-size: 11px; }
.sel { font-size: 11px; padding: 1px 4px; height: 22px; max-width: 130px; }

.geom-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 4px; }
.g-cell {
  display: flex; align-items: center; gap: 4px;
  background: var(--bg-2); border: 1px solid var(--border);
  border-radius: 2px; padding: 2px 6px;
}
.g-cell .lbl { min-width: 18px; font-family: var(--font-mono); font-size: 9.5px; }
.g-cell input {
  flex: 1; min-width: 0; background: transparent; border: none; color: var(--text-1);
  font-family: var(--font-mono); font-size: 10.5px; padding: 0; outline: none;
}

.freq-list { display: flex; flex-direction: column; gap: 2px; padding-top: 2px; }
.freq-row {
  display: grid; grid-template-columns: 8px 36px 1fr auto;
  align-items: center; gap: 4px; padding: 3px 4px;
  background: var(--bg-2); border: 1px solid var(--border); border-radius: 2px; font-size: 10px;
}
.freq-row.alarm { background: rgba(255,51,85,0.06); border-color: rgba(255,51,85,0.4); }
.dot { width: 6px; height: 6px; border-radius: 50%; }
.freq-name { color: var(--text-1); font-weight: 600; letter-spacing: 0.04em; }
.freq-hz { color: var(--text-2); text-align: right; }
.freq-amp { font-weight: 600; }

.diag {
  display: flex; align-items: center; gap: 6px; padding: 5px 8px; border-radius: 2px;
  font-size: 10.5px; background: var(--bg-2); border: 1px solid var(--border);
}
.diag.ok   { color: var(--green);  border-color: rgba(0,255,149,0.3);  background: rgba(0,255,149,0.05); }
.diag.warn { color: var(--amber);  border-color: rgba(255,170,0,0.4);  background: rgba(255,170,0,0.06); }
.diag.high { color: var(--red);    border-color: rgba(255,51,85,0.5);  background: rgba(255,51,85,0.08); }
.diag-icon { font-weight: 600; }
.diag-text { line-height: 1.3; }

.add-bearing-btn {
  font-size: 10px; padding: 3px 10px; margin-top: 2px;
  background: rgba(0,217,255,0.06); border: 1px dashed rgba(0,217,255,0.4);
  border-radius: 2px; color: var(--cyan); cursor: pointer;
}
.add-bearing-btn:hover { background: rgba(0,217,255,0.12); }

.text-purple { color: var(--purple); }
.inline-num {
  width: 60px; background: var(--bg-2); border: 1px solid var(--border);
  border-radius: 2px; padding: 1px 6px; color: var(--text-1);
  font-family: var(--font-mono); font-size: 11px; outline: none;
}
.toggle:disabled { opacity: 0.4; cursor: not-allowed; }
</style>
