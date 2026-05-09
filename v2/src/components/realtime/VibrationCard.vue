<template>
  <div class="vib-card corners">
    <div class="c-br" /><div class="c-bl" />
    <div class="card-header">
      <span class="ch-id mono">V02</span>
      <span>{{ locale === 'zh' ? vibCh.nameZh : vibCh.nameEn }}</span>
      <span class="mono" style="color: var(--red)">{{ rmsVal }} <small>g RMS</small></span>
    </div>

    <div class="waveform-wrap">
      <GlowCanvas ref="waveCanvas" />
    </div>

    <div class="fft-header mono text-dim">
      <span>FFT · {{ Math.round(rpmHz * 60) }} RPM</span>
      <span>RMS {{ rmsVal }} · Peak {{ peakVal }} · CF {{ cfVal }}</span>
    </div>

    <div class="fft-wrap">
      <GlowCanvas ref="fftCanvas" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { useAcquisitionStore } from '@/stores/acquisition'
import { useDspStore } from '@/stores/dsp'
import { CHANNEL_MAP } from '@/config/channels'
import { useGLPlot } from '@/composables/useGLPlot'
import { useGLBars } from '@/composables/useGLBars'
import { useAnimationLoop, shouldDraw } from '@/composables/useAnimationLoop'
import { computeRms, computePeak, computeCrestFactor } from '@/dsp/metrics'
import GlowCanvas from '@/components/common/GlowCanvas.vue'
import { useI18n } from 'vue-i18n'

const { locale } = useI18n()
const acqStore = useAcquisitionStore()
const dspStore = useDspStore()

const vibCh = CHANNEL_MAP.get('V02')!

const waveCanvas = ref<InstanceType<typeof GlowCanvas> | null>(null)
const fftCanvas = ref<InstanceType<typeof GlowCanvas> | null>(null)
const waveCanvasRef = computed(() => waveCanvas.value?.canvas ?? null)
const fftCanvasRef = computed(() => fftCanvas.value?.canvas ?? null)

const { draw: drawWave } = useGLPlot(waveCanvasRef)
const { draw: drawBars } = useGLBars(fftCanvasRef)

const buf = computed(() => acqStore.channelBuffers['V02']?.buffer ?? [])
const rpmHz = computed(() => (acqStore.channelValues['V01'] ?? 1500) / 60)

const rmsVal = computed(() => {
  if (!buf.value.length) return '0.00'
  return computeRms(new Float32Array(buf.value)).toFixed(3)
})
const peakVal = computed(() => {
  if (!buf.value.length) return '0.00'
  return computePeak(new Float32Array(buf.value)).toFixed(3)
})
const cfVal = computed(() => {
  if (!buf.value.length) return '0.0'
  const f = new Float32Array(buf.value)
  return computeCrestFactor(f).toFixed(1)
})

let fftBars: Float32Array | null = null
let localFftTimer = 0

useAnimationLoop((now) => {
  if (shouldDraw('vib-wave', 30)) {
    if (buf.value.length >= 2) {
      drawWave(buf.value, vibCh.hex, { min: -3, max: 3, fill: false })
    }
  }

  // Compute local mini-FFT every 200ms for the bars display
  if (now - localFftTimer > 200) {
    localFftTimer = now
    if (dspStore.selectedChannelId === 'V02' && dspStore.fftResult) {
      // Use dspStore result if available
      const res = dspStore.fftResult
      fftBars = new Float32Array(64)
      const step = Math.floor(res.magnitudeDb.length / 64)
      for (let i = 0; i < 64; i++) {
        const db = res.magnitudeDb[i * step]
        fftBars[i] = Math.max(0, Math.min(1, (db + 80) / 80))
      }
    } else {
      // Local mini FFT from time buffer
      fftBars = new Float32Array(64)
      const b = buf.value
      if (b.length >= 64) {
        for (let i = 0; i < 64; i++) {
          const v = Math.abs(b[b.length - 64 + i])
          fftBars[i] = Math.min(1, v / 3)
        }
      }
    }
  }

  if (shouldDraw('vib-fft', 15) && fftBars) {
    drawBars(fftBars, vibCh.hex)
  }
})
</script>

<style scoped>
.vib-card {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--r2);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.card-header {
  display: flex; align-items: center; gap: 8px;
  padding: 6px 10px; border-bottom: 1px solid var(--border);
  font-size: 11px;
}
.card-header > span:nth-child(2) { flex: 1; color: var(--text-1); }
.card-header small { font-size: 10px; color: var(--text-2); }
.ch-id { color: var(--text-2); }
.waveform-wrap { height: 70px; }
.fft-header {
  display: flex; justify-content: space-between;
  padding: 3px 10px; font-size: 10px; background: var(--bg-2);
  border-top: 1px solid var(--border);
}
.fft-wrap { height: 60px; }
</style>
