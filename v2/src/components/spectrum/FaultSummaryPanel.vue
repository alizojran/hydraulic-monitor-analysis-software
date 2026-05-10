<template>
  <div class="fsp">
    <div class="fsp-head">
      <span class="fsp-title mono">{{ locale === 'zh' ? '故障诊断' : 'FAULT DIAGNOSIS' }}</span>
      <span class="overall-badge" :class="`sev-${overallSev}`">{{ overallSev.toUpperCase() }}</span>
      <button class="report-btn" :title="locale === 'zh' ? '导出报告' : 'Export report'" @click="exportReport">
        ⤓ {{ locale === 'zh' ? '报告' : 'Report' }}
      </button>
    </div>

    <div v-if="!hasFftResult" class="fsp-empty">
      {{ locale === 'zh' ? '等待 FFT 数据…' : 'Waiting for FFT data…' }}
    </div>

    <template v-else>
      <div v-for="fault in classifiedFaults" :key="fault.faultType" class="fault-row" :class="`row-${fault.severity}`">
        <span class="ft-badge mono" :class="`sev-${fault.severity}`">{{ fault.faultType }}</span>
        <div class="ft-info">
          <span class="ft-desc">{{ locale === 'zh' ? fault.descriptionZh : fault.description }}</span>
          <span class="ft-detail mono">
            SNR {{ fault.snrDb.toFixed(1) }} dB
            <template v-if="fault.hits.length">
              · {{ fault.hits[0].frequencyHz.toFixed(1) }} Hz
            </template>
          </span>
        </div>
        <span class="sev-dot" :class="`dot-${fault.severity}`" />
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useDspStore } from '@/stores/dsp'
import { classifyBearingFaults, overallSeverity } from '@/dsp/faultClassifier'
import { computeBearingFrequencies } from '@/dsp/bearing'
import { useReport } from '@/composables/useReport'

const { locale } = useI18n()
const dspStore = useDspStore()
const { generate } = useReport()

const spectrumEl = ref<HTMLElement | null>(null)

const hasFftResult = computed(() => !!dspStore.fftResult)

const classifiedFaults = computed(() => {
  const fft = dspStore.fftResult
  if (!fft) return []
  const bearing = dspStore.bearings[0]
  if (!bearing) return []
  const geometry = computeBearingFrequencies({
    ...bearing.params,
    rpmHz: dspStore.bearingShaftRpm / 60,
  })
  return classifyBearingFaults(fft.magnitudeDb, fft.frequencies, geometry)
})

const overallSev = computed(() => overallSeverity(classifiedFaults.value))

async function exportReport() {
  const el = document.querySelector<HTMLElement>('.spectrum-view .center')
  await generate({
    spectrumEl: el,
    faults: classifiedFaults.value,
    locale: locale.value as 'zh' | 'en',
  })
}
</script>

<style scoped>
.fsp {
  padding: 10px 12px;
  display: flex; flex-direction: column; gap: 4px;
}
.fsp-head {
  display: flex; align-items: center; gap: 6px; margin-bottom: 6px;
}
.fsp-title { font-size: 10px; letter-spacing: 0.1em; color: var(--text-2); flex: 1; }

.overall-badge {
  font-size: 10px; font-family: var(--font-mono); font-weight: 700;
  padding: 1px 7px; border-radius: 3px; letter-spacing: 0.06em;
}
.sev-none    { background: transparent; color: var(--text-2); border: 1px solid var(--border); }
.sev-watch   { background: rgba(255,170,0,0.12); color: var(--amber); border: 1px solid rgba(255,170,0,0.4); }
.sev-warning { background: rgba(255,136,0,0.12); color: #ff8800; border: 1px solid rgba(255,136,0,0.4); }
.sev-critical{ background: rgba(255,51,85,0.12); color: var(--red); border: 1px solid rgba(255,51,85,0.4); }

.report-btn {
  font-size: 10px; padding: 2px 8px;
  background: rgba(0,217,255,0.08); border: 1px solid rgba(0,217,255,0.3);
  color: var(--cyan); border-radius: var(--r); font-family: var(--font-mono);
}
.report-btn:hover { background: rgba(0,217,255,0.18); }

.fsp-empty { font-size: 11px; color: var(--text-2); padding: 4px 0; }

.fault-row {
  display: flex; align-items: center; gap: 8px;
  padding: 5px 6px; border-radius: var(--r);
  border: 1px solid transparent;
  transition: background 0.15s;
}
.row-watch   { background: rgba(255,170,0,0.04); border-color: rgba(255,170,0,0.15); }
.row-warning { background: rgba(255,136,0,0.06); border-color: rgba(255,136,0,0.2); }
.row-critical{ background: rgba(255,51,85,0.07); border-color: rgba(255,51,85,0.25); }

.ft-badge {
  font-size: 10px; font-weight: 700; padding: 1px 6px;
  border-radius: 3px; flex-shrink: 0;
}
.ft-info { display: flex; flex-direction: column; flex: 1; min-width: 0; }
.ft-desc { font-size: 11px; color: var(--text-1); line-height: 1.3; }
.ft-detail { font-size: 10px; color: var(--text-2); }

.sev-dot { width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0; }
.dot-none    { background: var(--border-2); }
.dot-watch   { background: var(--amber); }
.dot-warning { background: #ff8800; box-shadow: 0 0 5px rgba(255,136,0,0.5); }
.dot-critical{ background: var(--red); box-shadow: 0 0 6px rgba(255,51,85,0.6); animation: pulse 1.5s ease-in-out infinite; }
@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }
</style>
