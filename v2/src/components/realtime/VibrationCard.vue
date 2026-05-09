<template>
  <div class="vib-card corners">
    <div class="c-br" /><div class="c-bl" />

    <div class="card-header">
      <span class="ch-id mono text-dim">V02 · Vy</span>
      <span class="ch-name">{{ locale === 'zh' ? vibCh.nameZh : vibCh.nameEn }}</span>
      <span class="header-meta mono">±3 g · IEPE</span>
    </div>

    <div class="vib-value">
      <span class="vib-rms mono" style="color: var(--red); text-shadow: 0 0 14px rgba(255,51,85,0.4)">
        {{ rmsVal }}<small> g RMS</small>
      </span>
      <span class="vib-trend mono" :class="rmsTrendCls">{{ rmsTrendIcon }} {{ rmsTrendDelta }}</span>
    </div>

    <div class="fft-header mono text-dim">
      <span>FFT · {{ Math.round(rpmHz * 60) }} RPM</span>
      <span>0 Hz <span style="margin: 0 4px">→</span> 500 Hz</span>
    </div>

    <div class="fft-wrap">
      <GlowCanvas ref="fftCanvas" />
    </div>

    <div class="vib-stats mono">
      <div class="vib-stat"><span class="text-dim">RMS</span><span :style="{color:'var(--red)'}">{{ rmsVal }}</span></div>
      <div class="vib-stat"><span class="text-dim">PEAK</span><span>{{ peakVal }}</span></div>
      <div class="vib-stat"><span class="text-dim">{{ $t('vibration.peakFreq') }}</span><span class="text-cyan">{{ peakFreqHz }} Hz</span></div>
      <div class="vib-stat"><span class="text-dim">CF</span><span>{{ cfVal }}</span></div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { useAcquisitionStore } from '@/stores/acquisition'
import { CHANNEL_MAP } from '@/config/channels'
import { useGLBars } from '@/composables/useGLBars'
import { useAnimationLoop, shouldDraw } from '@/composables/useAnimationLoop'
import { computeRms, computePeak, computeCrestFactor } from '@/dsp/metrics'
import GlowCanvas from '@/components/common/GlowCanvas.vue'
import { useI18n } from 'vue-i18n'

const { locale } = useI18n()
const acqStore = useAcquisitionStore()

const vibCh = CHANNEL_MAP.get('V02')!

const fftCanvas = ref<InstanceType<typeof GlowCanvas> | null>(null)
const fftCanvasRef = computed(() => fftCanvas.value?.canvas ?? null)
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

const peakFreqHz = ref('25')

let lastRms = 0
const rmsTrendDelta = ref('+0.000')
const rmsTrendIcon = ref('→')
const rmsTrendCls = ref('')

let fftBars: Float32Array | null = null
let fftTimer = 0
let trendTimer = 0

useAnimationLoop((now) => {
  // Compute a 64-bin spectrum from the recent samples
  if (now - fftTimer > 120) {
    fftTimer = now
    const b = buf.value
    const N = 256
    if (b.length >= N) {
      const out = new Float32Array(64)
      const start = b.length - N
      // remove DC + Hann window
      let mean = 0
      for (let i = 0; i < N; i++) mean += b[start + i]
      mean /= N
      const win = new Float32Array(N)
      for (let n = 0; n < N; n++) {
        const w = 0.5 * (1 - Math.cos((2 * Math.PI * n) / (N - 1)))
        win[n] = (b[start + n] - mean) * w
      }
      // Goertzel sweep — log-distributed bins between 0 and Nyquist (~500 Hz)
      let maxMag = 0
      let maxK = 0
      for (let k = 0; k < 64; k++) {
        // log-frequency: weights low end so harmonics near 25/50 Hz are visible
        const f = Math.pow(k / 63, 1.6) * 0.98
        const w = Math.PI * f
        let sr = 0, si = 0
        for (let n = 0; n < N; n++) {
          sr += win[n] * Math.cos(w * n)
          si += win[n] * Math.sin(w * n)
        }
        const mag = Math.sqrt(sr * sr + si * si) / N
        if (mag > maxMag) { maxMag = mag; maxK = k }
        out[k] = Math.max(0, Math.min(1, Math.log10(1 + mag * 6) * 0.65))
      }
      fftBars = out
      // Convert peak bin back to Hz (Nyquist 500 Hz, sample buffer is at 1000Hz/2 effectively)
      const peakF = Math.pow(maxK / 63, 1.6) * 500
      peakFreqHz.value = peakF.toFixed(0)
    }
  }

  if (shouldDraw('vib-fft', 24) && fftBars) {
    drawBars(fftBars, vibCh.hex)
  }

  // RMS trend indicator every 1s
  if (now - trendTimer > 1000) {
    trendTimer = now
    const r = parseFloat(rmsVal.value)
    const delta = r - lastRms
    lastRms = r
    const sign = delta >= 0 ? '+' : ''
    rmsTrendDelta.value = sign + delta.toFixed(3)
    if (Math.abs(delta) < 0.005) { rmsTrendIcon.value = '→'; rmsTrendCls.value = '' }
    else if (delta > 0) { rmsTrendIcon.value = '▲'; rmsTrendCls.value = 'up' }
    else { rmsTrendIcon.value = '▼'; rmsTrendCls.value = 'down' }
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
  padding: 5px 10px; border-bottom: 1px solid var(--border);
  background: var(--bg-2);
  font-size: 11px;
}
.ch-id { font-size: 10px; letter-spacing: 0.06em; }
.ch-name { flex: 1; color: var(--text-1); }
.header-meta { font-size: 9.5px; color: var(--text-2); letter-spacing: 0.06em; }

.vib-value {
  display: flex; align-items: baseline; gap: 8px;
  padding: 8px 10px 2px;
}
.vib-rms { font-size: 22px; font-weight: 700; line-height: 1.05; }
.vib-rms small { font-size: 10px; font-weight: 500; color: var(--text-2); margin-left: 2px; }
.vib-trend { font-size: 10px; color: var(--text-2); margin-left: auto; }
.vib-trend.up { color: var(--red); }
.vib-trend.down { color: var(--green); }

.fft-header {
  display: flex; justify-content: space-between;
  padding: 4px 10px 2px; font-size: 9.5px; letter-spacing: 0.06em;
}
.fft-wrap { flex: 1; min-height: 80px; padding: 0 4px; }

.vib-stats {
  display: grid; grid-template-columns: 1fr 1fr;
  gap: 1px 10px;
  padding: 6px 10px; border-top: 1px solid var(--border);
  background: var(--bg-2); font-size: 10.5px;
}
.vib-stat { display: flex; justify-content: space-between; }
.vib-stat .text-dim { letter-spacing: 0.04em; }
</style>
