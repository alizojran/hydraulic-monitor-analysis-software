<template>
  <div class="acoustic-card corners">
    <div class="c-br" /><div class="c-bl" />

    <div class="card-header">
      <span class="ch-id mono text-dim">S01 · {{ $t('acoustic.spl') }}</span>
      <span class="header-meta mono text-dim">DURATION <span class="text-1">{{ duration }}</span></span>
      <span class="flex-spacer" />
      <span class="header-meta text-dim">{{ $t('acoustic.subtitle') }}</span>
    </div>

    <div class="ac-body">
      <!-- Left: big SPL value + horizontal gradient + stats -->
      <div class="ac-left">
        <div class="db-block">
          <span class="db-val mono" :style="{ color: dbColor, textShadow: `0 0 14px ${dbColor}66` }">
            {{ dbVal }}<small> dB(A)</small>
          </span>
        </div>
        <div class="spl-bar">
          <div class="spl-grad" />
          <div class="spl-marker" :style="{ left: dbPercent + '%' }" />
          <div class="spl-ticks">
            <span>40</span><span>60</span><span>80</span><span>100</span><span>120</span>
          </div>
        </div>
        <div class="ac-stats mono">
          <div class="ac-stat-row"><span class="text-dim">PEAK</span><span>{{ peakDb }} dB</span></div>
          <div class="ac-stat-row"><span class="text-dim">LAeq</span><span>{{ laeq }} dB</span></div>
          <div class="ac-stat-row"><span class="text-dim">L10</span><span>{{ l10 }} dB</span></div>
          <div class="ac-stat-row"><span class="text-dim">L90</span><span>{{ l90 }} dB</span></div>
          <div class="ac-stat-row"><span class="text-dim">{{ $t('acoustic.peakFreq') }}</span><span class="text-cyan">{{ peakFreq }} kHz</span></div>
          <div class="ac-stat-row"><span class="text-dim">{{ $t('acoustic.bandwidth') }}</span><span>20 kHz</span></div>
        </div>
      </div>

      <!-- Right: waveform on top, spectrogram below -->
      <div class="ac-right">
        <div class="ac-wave-label mono text-dim">WAVEFORM · 20 Hz – 20 kHz</div>
        <div class="waveform"><GlowCanvas ref="waveCanvas" /></div>
        <div class="ac-wave-label mono text-dim">SPECTROGRAM</div>
        <div class="spectrogram"><GlowCanvas ref="spectroCanvas" /></div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { useAcquisitionStore } from '@/stores/acquisition'
import { useGLPlot } from '@/composables/useGLPlot'
import { useGLHeatmap } from '@/composables/useGLHeatmap'
import { useAnimationLoop, shouldDraw } from '@/composables/useAnimationLoop'
import GlowCanvas from '@/components/common/GlowCanvas.vue'

const acqStore = useAcquisitionStore()

const waveCanvas = ref<InstanceType<typeof GlowCanvas> | null>(null)
const spectroCanvas = ref<InstanceType<typeof GlowCanvas> | null>(null)
const waveRef = computed(() => waveCanvas.value?.canvas ?? null)
const spectroRef = computed(() => spectroCanvas.value?.canvas ?? null)

const { draw: drawWave } = useGLPlot(waveRef)
const { pushColumn, draw: drawSpectro } = useGLHeatmap(spectroRef, 64, 200)

const db = computed(() => acqStore.channelValues['S01'] ?? 72)
const buf = computed(() => acqStore.channelBuffers['S01']?.buffer ?? [])

const dbVal = computed(() => db.value.toFixed(1))
const dbPercent = computed(() => Math.max(0, Math.min(100, ((db.value - 40) / 80) * 100)))
const dbColor = computed(() => {
  const p = dbPercent.value
  if (p > 80) return '#ff3355'
  if (p > 60) return '#ff8800'
  if (p > 40) return '#ffe600'
  return '#00ff95'
})

const peakDb = computed(() => buf.value.length ? Math.max(...buf.value).toFixed(1) : '—')
const laeq = computed(() => {
  const b = buf.value
  if (!b.length) return '—'
  // Energy-equivalent average: 10·log10( mean(10^(L/10)) )
  let s = 0
  for (let i = 0; i < b.length; i++) s += Math.pow(10, b[i] / 10)
  return (10 * Math.log10(s / b.length)).toFixed(1)
})
const l10 = computed(() => percentile(buf.value, 0.9))
const l90 = computed(() => percentile(buf.value, 0.1))

function percentile(b: number[] | Float32Array, p: number): string {
  if (!b.length) return '—'
  const arr = Array.from(b).sort((a, c) => a - c)
  const idx = Math.floor(p * (arr.length - 1))
  return arr[idx].toFixed(1)
}

const duration = computed(() => {
  const s = Math.max(0, Math.floor(acqStore.elapsedSec))
  const m = Math.floor(s / 60), sec = s % 60
  return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
})

const peakFreq = ref('1.92')
let peakRollTimer = 0

let spectroTimer = 0

useAnimationLoop((now) => {
  if (shouldDraw('ac-wave', 24) && buf.value.length >= 2) {
    drawWave(buf.value, '#ffe600', { min: 40, max: 120, fill: true, fillAlpha: 0.18 })
  }

  if (now - spectroTimer > 100) {
    spectroTimer = now
    const b = buf.value
    const N = 128
    if (b.length >= N) {
      const col = new Float32Array(64)
      const start = b.length - N
      let mean = 0
      for (let n = 0; n < N; n++) mean += b[start + n]
      mean /= N
      const win = new Float32Array(N)
      for (let n = 0; n < N; n++) {
        const w = 0.5 * (1 - Math.cos((2 * Math.PI * n) / (N - 1)))
        win[n] = (b[start + n] - mean) * w
      }
      for (let k = 0; k < 64; k++) {
        const w = (Math.PI * (k + 1)) / 64
        let sr = 0, si = 0
        for (let n = 0; n < N; n++) {
          sr += win[n] * Math.cos(w * n)
          si += win[n] * Math.sin(w * n)
        }
        const mag = Math.sqrt(sr * sr + si * si) / N
        col[k] = Math.max(0, Math.min(1, Math.log10(1 + mag * 12) * 0.7))
      }
      pushColumn(col)
    }
  }
  drawSpectro()

  if (now - peakRollTimer > 1500) {
    peakRollTimer = now
    // simulated peak frequency drift around motor harmonic
    peakFreq.value = (1.85 + Math.random() * 0.2).toFixed(2)
  }
})
</script>

<style scoped>
.acoustic-card {
  background: var(--bg-card); border: 1px solid var(--border);
  border-radius: var(--r2); display: flex; flex-direction: column; overflow: hidden;
  height: 100%;
}
.card-header {
  display: flex; align-items: center; gap: 14px;
  padding: 5px 12px; border-bottom: 1px solid var(--border);
  background: var(--bg-2); font-size: 11px;
}
.flex-spacer { flex: 1; }
.header-meta { font-size: 10.5px; letter-spacing: 0.06em; }

.ac-body {
  flex: 1; display: grid; grid-template-columns: 240px 1fr;
  gap: 10px; padding: 10px 12px; min-height: 0;
}

.ac-left { display: flex; flex-direction: column; gap: 8px; }
.db-block { display: flex; align-items: baseline; gap: 4px; }
.db-val { font-size: 36px; font-weight: 700; line-height: 1; letter-spacing: 0.01em; }
.db-val small { font-size: 12px; font-weight: 500; color: var(--text-2); margin-left: 2px; }

.spl-bar { position: relative; height: 18px; }
.spl-grad {
  position: absolute; inset: 0;
  background: linear-gradient(90deg, #00ff95 0%, #ffe600 40%, #ff8800 70%, #ff3355 100%);
  border-radius: 2px; opacity: 0.7;
  border: 1px solid var(--border);
}
.spl-marker {
  position: absolute; top: -3px; bottom: -3px; width: 2px;
  background: #fff; box-shadow: 0 0 6px #fff;
  transform: translateX(-1px); transition: left 0.15s linear;
}
.spl-ticks {
  position: absolute; top: 100%; left: 0; right: 0;
  display: flex; justify-content: space-between;
  font-family: var(--font-mono); font-size: 9px; color: var(--text-2);
  padding: 2px 0;
}

.ac-stats {
  display: grid; grid-template-columns: 1fr 1fr; gap: 2px 14px;
  font-size: 11px; padding-top: 8px;
}
.ac-stat-row { display: flex; justify-content: space-between; }
.ac-stat-row .text-dim { letter-spacing: 0.06em; font-size: 10px; }

.ac-right {
  display: flex; flex-direction: column; gap: 2px;
  min-height: 0;
}
.ac-wave-label { font-size: 9px; letter-spacing: 0.1em; padding: 2px 0 0; }
.waveform { height: 60px; flex-shrink: 0; }
.spectrogram { flex: 1; min-height: 60px; }
</style>
