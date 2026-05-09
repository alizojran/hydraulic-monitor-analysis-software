<template>
  <div class="acoustic-card corners">
    <div class="c-br" /><div class="c-bl" />
    <div class="card-header">
      <span class="mono text-dim">S01</span>
      <span class="text-1">{{ $t('channel.S01') }}</span>
      <span class="mono" style="color:var(--yellow)">{{ dbVal }} <small>dB SPL</small></span>
    </div>
    <div class="ac-body">
      <div class="db-meter">
        <div class="db-bar-wrap">
          <div class="db-bar" :style="{ height: dbPercent + '%', background: dbBarColor }" />
        </div>
        <div class="db-scale">
          <span>120</span><span>90</span><span>60</span><span>40</span>
        </div>
      </div>
      <div class="ac-right">
        <div class="waveform"><GlowCanvas ref="waveCanvas" /></div>
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
const { pushColumn, draw: drawSpectro } = useGLHeatmap(spectroRef, 64, 128)

const db = computed(() => acqStore.channelValues['S01'] ?? 72)
const buf = computed(() => acqStore.channelBuffers['S01']?.buffer ?? [])

const dbVal = computed(() => db.value.toFixed(1))
const dbPercent = computed(() => Math.max(0, Math.min(100, ((db.value - 40) / 80) * 100)))
const dbBarColor = computed(() => {
  const p = dbPercent.value
  if (p > 80) return 'var(--red)'
  if (p > 60) return 'var(--amber)'
  return 'var(--yellow)'
})

let spectroTimer = 0

useAnimationLoop((now) => {
  if (shouldDraw('ac-wave', 20) && buf.value.length >= 2) {
    drawWave(buf.value, '#ffe600', { min: 40, max: 120 })
  }

  // push spectro column every 100ms — quick magnitude-spectrum approximation
  if (now - spectroTimer > 100) {
    spectroTimer = now
    const b = buf.value
    const N = 128
    if (b.length >= N) {
      const col = new Float32Array(64)
      const start = b.length - N
      // Subtract DC: spectrogram should show variation, not the 70 dB baseline
      let mean = 0
      for (let n = 0; n < N; n++) mean += b[start + n]
      mean /= N
      const win = new Float32Array(N)
      for (let n = 0; n < N; n++) {
        // Hann window + DC removal
        const w = 0.5 * (1 - Math.cos((2 * Math.PI * n) / (N - 1)))
        win[n] = (b[start + n] - mean) * w
      }
      // Goertzel-style sweep over 64 bins
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
})
</script>

<style scoped>
.acoustic-card {
  background: var(--bg-card); border: 1px solid var(--border);
  border-radius: var(--r2); display: flex; flex-direction: column; overflow: hidden;
}
.card-header {
  display: flex; align-items: center; gap: 8px;
  padding: 6px 10px; border-bottom: 1px solid var(--border); font-size: 11px;
}
.card-header > span:nth-child(2) { flex: 1; }
.card-header small { font-size: 10px; color: var(--text-2); }
.ac-body { display: flex; gap: 8px; padding: 8px; flex: 1; }
.db-meter { display: flex; gap: 4px; align-items: stretch; }
.db-bar-wrap {
  width: 14px; background: var(--bg-2); border-radius: 3px;
  display: flex; flex-direction: column; justify-content: flex-end; overflow: hidden;
}
.db-bar { width: 100%; transition: height 0.1s linear; border-radius: 2px; }
.db-scale {
  display: flex; flex-direction: column; justify-content: space-between;
  font-size: 9px; color: var(--text-dim); font-family: var(--font-mono);
  text-align: right;
}
.ac-right { flex: 1; display: flex; flex-direction: column; gap: 4px; }
.waveform { height: 50px; }
.spectrogram { flex: 1; min-height: 50px; }
</style>
