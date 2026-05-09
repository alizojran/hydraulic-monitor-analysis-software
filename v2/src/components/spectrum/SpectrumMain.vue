<template>
  <div class="spectrum-main">
    <div class="spec-header">
      <span class="text-dim">{{ $t('spectrum.channel') }}</span>
      <select :value="dspStore.selectedChannelId" @change="onChChange">
        <option v-for="ch in spectralChannels" :key="ch.id" :value="ch.id">
          {{ ch.id }} · {{ locale === 'zh' ? ch.nameZh : ch.nameEn }}
        </option>
      </select>
      <span class="text-dim">{{ $t('spectrum.windowFn') }}</span>
      <select :value="dspStore.fftConfig.window" @change="e => dspStore.setFftConfig({ window: (e.target as HTMLSelectElement).value as any })">
        <option v-for="w in WINDOWS" :key="w">{{ w }}</option>
      </select>
      <span class="text-dim">{{ $t('spectrum.fftSize') }}</span>
      <select :value="dspStore.fftConfig.fftSize" @change="e => dspStore.setFftConfig({ fftSize: parseInt((e.target as HTMLSelectElement).value) as any })">
        <option v-for="s in FFT_SIZES" :key="s">{{ s }}</option>
      </select>
      <span class="text-dim">{{ $t('spectrum.averages') }}</span>
      <select :value="dspStore.fftConfig.averages" @change="e => dspStore.setFftConfig({ averages: parseInt((e.target as HTMLSelectElement).value) as any })">
        <option v-for="a in [1,4,8,16,32]" :key="a">{{ a }}</option>
      </select>
    </div>

    <div class="canvas-area">
      <div class="y-axis">
        <span v-for="tick in yTicks" :key="tick.v" class="y-tick mono" :style="{ bottom: tick.pct + '%' }">{{ tick.v }}</span>
      </div>
      <GlowCanvas ref="specCanvas" class="spec-canvas" />
    </div>

    <div class="x-axis">
      <span v-for="tick in xTicks" :key="tick.hz" class="x-tick mono" :style="{ left: tick.pct + '%' }">{{ tick.label }}</span>
    </div>

    <div class="stats-row">
      <div v-if="res" class="stat">RMS <span class="mono text-cyan">{{ res.rms.toFixed(4) }}</span></div>
      <div v-if="res" class="stat">Peak <span class="mono text-green">{{ res.peakValue.toFixed(4) }}</span></div>
      <div v-if="res" class="stat">Crest <span class="mono text-amber">{{ res.crestFactor.toFixed(2) }}</span></div>
      <div v-if="res" class="stat">THD <span class="mono text-1">{{ (res.thd * 100).toFixed(1) }}%</span></div>
      <div v-if="res" class="stat text-dim">Δf {{ res.binHz.toFixed(2) }} Hz/bin</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useAcquisitionStore } from '@/stores/acquisition'
import { useDspStore } from '@/stores/dsp'
import { CHANNEL_DEFS, CHANNEL_MAP } from '@/config/channels'
import { useGLPlot } from '@/composables/useGLPlot'
import { useAnimationLoop, shouldDraw } from '@/composables/useAnimationLoop'
import GlowCanvas from '@/components/common/GlowCanvas.vue'
import { useI18n } from 'vue-i18n'

const { locale } = useI18n()
const acqStore = useAcquisitionStore()
const dspStore = useDspStore()

const WINDOWS = ['hamming', 'hanning', 'blackman', 'flattop', 'rect']
const FFT_SIZES = [512, 1024, 2048, 4096, 8192]

const spectralChannels = CHANNEL_DEFS.filter(c => c.type === 'vibration' || c.type === 'acoustic' || c.type === 'pressure')

const specCanvas = ref<InstanceType<typeof GlowCanvas> | null>(null)
const specCanvasRef = computed(() => specCanvas.value?.canvas ?? null)
const { draw } = useGLPlot(specCanvasRef)

const res = computed(() => dspStore.fftResult)
const ch = computed(() => CHANNEL_MAP.get(dspStore.selectedChannelId))

const yTicks = [
  { v: '0', pct: 0 }, { v: '-30', pct: 25 }, { v: '-60', pct: 50 }, { v: '-90', pct: 75 }, { v: '-120', pct: 100 }
]
const xTicks = computed(() => {
  if (!res.value) return []
  const nyq = dspStore.fftConfig.sampleRate / 2
  const ticks = [0.1, 0.2, 0.5, 1, 2, 5, 10].map(v => v * 1000).filter(hz => hz <= nyq)
  return ticks.map(hz => ({
    hz,
    pct: (hz / nyq) * 100,
    label: hz >= 1000 ? `${hz / 1000}k` : `${hz}`,
  }))
})

let fftTimer = 0
useAnimationLoop((now) => {
  // Request FFT computation at ~60 Hz (worker gates with pendingRequest)
  if (now - fftTimer > 16) {
    fftTimer = now
    const samples = acqStore.getFftSamples(dspStore.selectedChannelId, dspStore.fftConfig.fftSize)
    dspStore.requestFft(samples, dspStore.selectedChannelId)
  }

  if (shouldDraw('spectrum-main', 60) && res.value) {
    const { magnitudeDb } = res.value
    // normalize for display: -120..0 dB -> 0..1 for GLPlot
    const disp = new Float32Array(magnitudeDb.length)
    for (let i = 0; i < magnitudeDb.length; i++) {
      disp[i] = Math.max(-120, magnitudeDb[i])
    }
    draw(disp, ch.value?.hex ?? '#00d9ff', { min: -120, max: 0, fill: true, fillAlpha: 0.3, cols: 10, rows: 4 })
  }
})

function onChChange(e: Event) {
  dspStore.setSelectedChannel((e.target as HTMLSelectElement).value)
}
</script>

<style scoped>
.spectrum-main { display: flex; flex-direction: column; height: 100%; }
.spec-header {
  display: flex; align-items: center; gap: 8px; flex-wrap: wrap;
  padding: 6px 8px; font-size: 11px; border-bottom: 1px solid var(--border);
}
.canvas-area { display: flex; flex: 1; min-height: 0; position: relative; }
.y-axis {
  width: 36px; position: relative; flex-shrink: 0;
  border-right: 1px solid var(--border);
}
.y-tick {
  position: absolute; right: 4px; font-size: 9px; color: var(--text-dim);
  transform: translateY(50%);
}
.spec-canvas { flex: 1; }
.x-axis {
  height: 20px; position: relative; margin-left: 36px;
  border-top: 1px solid var(--border);
}
.x-tick { position: absolute; font-size: 9px; color: var(--text-dim); transform: translateX(-50%); }
.stats-row {
  display: flex; gap: 16px; padding: 4px 8px;
  font-size: 11px; border-top: 1px solid var(--border);
}
.stat { display: flex; gap: 4px; align-items: center; }
</style>
