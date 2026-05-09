<template>
  <div class="bd-panel">
    <div class="bd-head">
      <span class="title">{{ locale === 'zh' ? '轴承诊断' : 'BEARING' }}</span>
      <button class="toggle" :class="{ on: dspStore.bearingOverlay }" @click="dspStore.toggleBearingOverlay">
        {{ dspStore.bearingOverlay ? 'ON' : 'OFF' }}
      </button>
    </div>

    <!-- Preset / source RPM -->
    <div class="row">
      <span class="lbl">{{ locale === 'zh' ? '型号' : 'Model' }}</span>
      <select class="sel" :value="dspStore.bearingPreset" @change="onPresetChange">
        <option v-for="p in BEARING_PRESETS" :key="p.name" :value="p.name">{{ p.name }}</option>
        <option value="Custom">Custom</option>
      </select>
    </div>
    <div class="row">
      <span class="lbl">{{ locale === 'zh' ? '转速' : 'Shaft' }}</span>
      <span class="val mono text-cyan">{{ Math.round(dspStore.bearingShaftRpm) }} RPM</span>
    </div>

    <!-- Geometry inputs -->
    <div class="geom-grid">
      <label class="g-cell">
        <span class="lbl">Z</span>
        <input type="number" :value="dspStore.bearingParams.ballCount" min="3" max="40" @input="onParam('ballCount', $event)" />
      </label>
      <label class="g-cell">
        <span class="lbl">Pd</span>
        <input type="number" :value="dspStore.bearingParams.pitchDiamMm" step="0.1" min="5" max="500" @input="onParam('pitchDiamMm', $event)" />
      </label>
      <label class="g-cell">
        <span class="lbl">Bd</span>
        <input type="number" :value="dspStore.bearingParams.ballDiamMm" step="0.01" min="1" max="50" @input="onParam('ballDiamMm', $event)" />
      </label>
      <label class="g-cell">
        <span class="lbl">α°</span>
        <input type="number" :value="dspStore.bearingParams.contactAngleDeg" step="0.5" min="0" max="45" @input="onParam('contactAngleDeg', $event)" />
      </label>
    </div>

    <!-- Computed fault frequencies + spectrum amplitude readout -->
    <div class="freq-list">
      <div v-for="f in faultFreqs" :key="f.label" class="freq-row" :class="{ alarm: f.amplitude > -25 }">
        <span class="dot" :style="{ background: f.color }" />
        <span class="freq-name mono">{{ f.label }}</span>
        <span class="freq-hz mono">{{ f.hz.toFixed(1) }} Hz</span>
        <span class="freq-amp mono" :style="{ color: f.color }">{{ formatDb(f.amplitude) }} dB</span>
      </div>
    </div>

    <!-- Diagnosis hint -->
    <div class="diag" :class="diagnosis.cls">
      <span class="diag-icon">{{ diagnosis.icon }}</span>
      <span class="diag-text">{{ diagnosis.text }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, watchEffect } from 'vue'
import { useDspStore, BEARING_PRESETS } from '@/stores/dsp'
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

const COLORS = {
  BPFI: '#ff8800',
  BPFO: '#ff3355',
  BSF:  '#00ff95',
  FTF:  '#00d9ff',
} as const

const faultFreqs = computed(() => {
  const f = dspStore.bearingFreqs
  return [
    { label: 'BPFI', hz: f.bpfi, amplitude: amplitudeAt(f.bpfi), color: COLORS.BPFI, fault: locale.value === 'zh' ? '内圈' : 'Inner race' },
    { label: 'BPFO', hz: f.bpfo, amplitude: amplitudeAt(f.bpfo), color: COLORS.BPFO, fault: locale.value === 'zh' ? '外圈' : 'Outer race' },
    { label: 'BSF',  hz: f.bsf,  amplitude: amplitudeAt(f.bsf),  color: COLORS.BSF,  fault: locale.value === 'zh' ? '滚动体' : 'Rolling element' },
    { label: 'FTF',  hz: f.ftf,  amplitude: amplitudeAt(f.ftf),  color: COLORS.FTF,  fault: locale.value === 'zh' ? '保持架' : 'Cage' },
  ]
})

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

const diagnosis = computed(() => {
  const f = faultFreqs.value
  // Find dominant fault component (above -30 dB threshold)
  const elevated = f.filter(x => x.amplitude > -30).sort((a, b) => b.amplitude - a.amplitude)
  if (elevated.length === 0) {
    return {
      icon: '✓',
      cls: 'ok',
      text: locale.value === 'zh' ? '无明显故障特征' : 'No fault signature detected',
    }
  }
  const top = elevated[0]
  return {
    icon: '⚠',
    cls: top.amplitude > -20 ? 'high' : 'warn',
    text: locale.value === 'zh'
      ? `${top.fault}故障特征 · ${top.label} ${top.amplitude.toFixed(0)} dB`
      : `${top.fault} fault signature · ${top.label} ${top.amplitude.toFixed(0)} dB`,
  }
})

function onPresetChange(e: Event) {
  const name = (e.target as HTMLSelectElement).value
  if (name === 'Custom') {
    dspStore.bearingPreset = 'Custom'
  } else {
    dspStore.setBearingPreset(name)
  }
}

function onParam(key: 'ballCount' | 'pitchDiamMm' | 'ballDiamMm' | 'contactAngleDeg', e: Event) {
  const v = parseFloat((e.target as HTMLInputElement).value)
  if (Number.isNaN(v)) return
  dspStore.updateBearingParams({ [key]: v })
}
</script>

<style scoped>
.bd-panel {
  display: flex; flex-direction: column; gap: 6px;
  padding: 8px; font-size: 11px;
  border-top: 1px solid var(--border);
}
.bd-head {
  display: flex; justify-content: space-between; align-items: center;
  padding-bottom: 4px;
}
.title {
  font-size: 10px; color: var(--text-2); letter-spacing: 0.12em; text-transform: uppercase;
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

.freq-list { display: flex; flex-direction: column; gap: 2px; padding-top: 4px; }
.freq-row {
  display: grid;
  grid-template-columns: 8px 36px 1fr auto;
  align-items: center; gap: 4px;
  padding: 3px 4px;
  background: var(--bg-2); border: 1px solid var(--border);
  border-radius: 2px;
  font-size: 10px;
}
.freq-row.alarm { background: rgba(255,51,85,0.06); border-color: rgba(255,51,85,0.4); }
.dot { width: 6px; height: 6px; border-radius: 50%; }
.freq-name { color: var(--text-1); font-weight: 600; letter-spacing: 0.04em; }
.freq-hz { color: var(--text-2); text-align: right; }
.freq-amp { font-weight: 600; }

.diag {
  display: flex; align-items: center; gap: 6px;
  padding: 5px 8px; border-radius: 2px;
  font-size: 10.5px;
  background: var(--bg-2); border: 1px solid var(--border);
}
.diag.ok { color: var(--green); border-color: rgba(0,255,149,0.3); background: rgba(0,255,149,0.05); }
.diag.warn { color: var(--amber); border-color: rgba(255,170,0,0.4); background: rgba(255,170,0,0.06); }
.diag.high { color: var(--red); border-color: rgba(255,51,85,0.5); background: rgba(255,51,85,0.08); }
.diag-icon { font-weight: 600; }
.diag-text { line-height: 1.3; }
</style>
