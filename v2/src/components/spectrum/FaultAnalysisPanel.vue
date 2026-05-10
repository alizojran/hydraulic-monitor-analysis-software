<template>
  <div class="fap">
    <!-- Per-bearing fault frequency table + diagnosis -->
    <div v-for="(bearing, idx) in dspStore.allBearingFreqs" :key="bearing.id" class="fap-section">
      <div class="fap-bearing-label mono">{{ bearing.name }}</div>

      <div class="freq-list">
        <div
          v-for="f in faultFreqsFor(idx)"
          :key="f.label"
          class="freq-row"
          :class="{ alarm: f.amplitude > -25 }"
        >
          <span class="dot" :style="{ background: f.color }" />
          <span class="freq-name mono">{{ f.label }}</span>
          <span class="freq-hz mono">{{ f.hz.toFixed(1) }} Hz</span>
          <span class="freq-amp mono" :style="{ color: f.color }">{{ formatDb(f.amplitude) }} dB</span>
        </div>
      </div>

      <div class="diag" :class="diagnosisFor(idx).cls">
        <span class="diag-icon">{{ diagnosisFor(idx).icon }}</span>
        <span class="diag-text">{{ diagnosisFor(idx).text }}</span>
      </div>
    </div>

    <!-- Gear section -->
    <div class="gear-section">
      <div
        class="bd-head"
        style="margin-top: 6px; border-top: 1px dashed var(--border); padding-top: 6px"
      >
        <span class="title">{{ $t('spectrum.gear') }}</span>
        <button
          class="toggle"
          :class="{ on: dspStore.gearOverlay }"
          :disabled="dspStore.gearTeeth <= 0"
          @click="dspStore.toggleGearOverlay"
        >
          {{ dspStore.gearOverlay ? 'ON' : 'OFF' }}
        </button>
      </div>
      <div class="row">
        <span class="lbl">{{ $t('spectrum.gearTeeth') }}</span>
        <input
          class="inline-num"
          type="number"
          min="0"
          max="200"
          :value="dspStore.gearTeeth"
          @input="dspStore.setGearTeeth(parseInt(($event.target as HTMLInputElement).value) || 0)"
        />
      </div>
      <div v-if="dspStore.gearTeeth > 0" class="row">
        <span class="lbl mono" style="color: var(--purple)">GMF</span>
        <span class="val mono text-purple">{{ dspStore.gearFreqs.mesh.toFixed(1) }} Hz</span>
      </div>
      <div v-if="dspStore.gearTeeth > 0" class="row">
        <span class="lbl mono text-dim">±SB</span>
        <span class="val mono text-dim"
          >{{ dspStore.gearFreqs.sb1.toFixed(1) }} / {{ dspStore.gearFreqs.sb2.toFixed(1) }} Hz</span
        >
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useDspStore, getBearingColorSet } from '@/stores/dsp'
import { useI18n } from 'vue-i18n'
import { useLocaleName } from '@/composables/useLocaleName'

const { t } = useI18n()
const { localDescription } = useLocaleName()
const dspStore = useDspStore()

function faultFreqsFor(idx: number) {
  const b = dspStore.allBearingFreqs[idx]
  if (!b) return []
  const cs = getBearingColorSet(idx)
  return [
    { label: 'BPFI', hz: b.freqs.bpfi, amplitude: amplitudeAt(b.freqs.bpfi), color: cs.BPFI },
    { label: 'BPFO', hz: b.freqs.bpfo, amplitude: amplitudeAt(b.freqs.bpfo), color: cs.BPFO },
    { label: 'BSF', hz: b.freqs.bsf, amplitude: amplitudeAt(b.freqs.bsf), color: cs.BSF },
    { label: 'FTF', hz: b.freqs.ftf, amplitude: amplitudeAt(b.freqs.ftf), color: cs.FTF },
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
  const elevated = freqs.filter((x) => x.amplitude > -30).sort((a, b) => b.amplitude - a.amplitude)
  if (elevated.length === 0) {
    return {
      icon: '✓',
      cls: 'ok',
      text: t('spectrum.noFault'),
    }
  }
  const top = elevated[0]
  return {
    icon: '⚠',
    cls: top.amplitude > -20 ? 'high' : 'warn',
    text: localDescription({ descriptionZh: `${top.label} 故障特征 · ${top.amplitude.toFixed(0)} dB`, description: `${top.label} fault signature · ${top.amplitude.toFixed(0)} dB` }),
  }
}
</script>

<style scoped>
.fap {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.fap-section {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.fap-section + .fap-section {
  border-top: 1px dashed var(--border);
  padding-top: 6px;
}
.fap-bearing-label {
  font-size: 10px;
  color: var(--cyan);
  letter-spacing: 0.06em;
  text-transform: uppercase;
}
.freq-list {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.freq-row {
  display: grid;
  grid-template-columns: 8px 36px 1fr auto;
  align-items: center;
  gap: 4px;
  padding: 3px 4px;
  background: var(--bg-2);
  border: 1px solid var(--border);
  border-radius: 2px;
  font-size: 10px;
}
.freq-row.alarm {
  background: rgba(255, 51, 85, 0.06);
  border-color: rgba(255, 51, 85, 0.4);
}
.dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
}
.freq-name {
  color: var(--text-1);
  font-weight: 600;
  letter-spacing: 0.04em;
}
.freq-hz {
  color: var(--text-2);
  text-align: right;
}
.freq-amp {
  font-weight: 600;
}
.diag {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 5px 8px;
  border-radius: 2px;
  font-size: 10.5px;
  background: var(--bg-2);
  border: 1px solid var(--border);
}
.diag.ok {
  color: var(--green);
  border-color: rgba(0, 255, 149, 0.3);
  background: rgba(0, 255, 149, 0.05);
}
.diag.warn {
  color: var(--amber);
  border-color: rgba(255, 170, 0, 0.4);
  background: rgba(255, 170, 0, 0.06);
}
.diag.high {
  color: var(--red);
  border-color: rgba(255, 51, 85, 0.5);
  background: rgba(255, 51, 85, 0.08);
}
.diag-icon {
  font-weight: 600;
}
.diag-text {
  line-height: 1.3;
}
.gear-section {
  display: flex;
  flex-direction: column;
  gap: 5px;
}
.bd-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 5px;
}
.title {
  font-size: 10px;
  color: var(--text-2);
  letter-spacing: 0.12em;
  text-transform: uppercase;
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
.toggle:disabled {
  opacity: 0.4;
  cursor: not-allowed;
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
.inline-num {
  width: 60px;
  background: var(--bg-2);
  border: 1px solid var(--border);
  border-radius: 2px;
  padding: 1px 6px;
  color: var(--text-1);
  font-family: var(--font-mono);
  font-size: 11px;
  outline: none;
}
.text-purple {
  color: var(--purple);
}
</style>
