<template>
  <div class="flow-card corners">
    <div class="c-br" />
    <div class="c-bl" />
    <div class="card-header">
      <span class="mono text-dim">F01</span>
      <span class="ch-name">{{ $t('channel.F01') }}</span>
      <span class="header-meta mono text-dim">FS {{ maxFlow }} L/min</span>
    </div>

    <div class="flow-body">
      <div class="gauge-wrap">
        <canvas ref="gaugeCanvas" width="90" height="90" />
      </div>
      <div class="flow-stats mono">
        <div class="stat-row">
          <span class="text-dim">{{ locale === 'zh' ? '瞬时' : 'Instant' }}</span>
          <span style="color: var(--cyan)">{{ flowVal }} L/min</span>
        </div>
        <div class="stat-row">
          <span class="text-dim">{{ locale === 'zh' ? '均值' : 'Average' }}</span>
          <span>{{ avgV }} L/min</span>
        </div>
        <div class="stat-row">
          <span class="text-dim">{{ locale === 'zh' ? '累计' : 'Total' }}</span>
          <span>{{ totalL }} L</span>
        </div>
        <div class="stat-row">
          <span class="text-dim">{{ locale === 'zh' ? '脉动' : 'Ripple' }}</span>
          <span :class="rippleCls">{{ ripplePct }}%</span>
        </div>
        <div class="stat-row">
          <span class="text-dim">K-factor</span>
          <span class="text-1">183.2</span>
        </div>
      </div>
    </div>

    <div class="flow-trend">
      <GlowCanvas ref="trendCanvas" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useAcquisitionStore } from '@/stores/acquisition'
import { useGLPlot } from '@/composables/useGLPlot'
import { useAnimationLoop, shouldDraw } from '@/composables/useAnimationLoop'
import GlowCanvas from '@/components/common/GlowCanvas.vue'
import { useI18n } from 'vue-i18n'

const { locale } = useI18n()
const acqStore = useAcquisitionStore()
const gaugeCanvas = ref<HTMLCanvasElement | null>(null)
const trendCanvas = ref<InstanceType<typeof GlowCanvas> | null>(null)
const trendRef = computed(() => trendCanvas.value?.canvas ?? null)
const { draw: drawTrend } = useGLPlot(trendRef)

const maxFlow = 200

// Snapshot at 5 Hz so the big number / gauge dial don't flicker at 1 kHz.
const snapFlow = ref(0)
let snapTimer: ReturnType<typeof setInterval> | null = null
onMounted(() => {
  snapFlow.value = acqStore.channelValues['F01'] ?? 0
  snapTimer = setInterval(() => {
    snapFlow.value = acqStore.channelValues['F01'] ?? 0
  }, 200)
})
onUnmounted(() => {
  if (snapTimer) clearInterval(snapTimer)
})

const flow = computed(() => snapFlow.value)
const buf = computed(() => acqStore.channelBuffers['F01']?.buffer ?? [])
const flowVal = computed(() => flow.value.toFixed(1))
const avgV = computed(() =>
  buf.value.length ? (buf.value.reduce((a, b) => a + b, 0) / buf.value.length).toFixed(1) : '—',
)

const totalL = computed(() => {
  const avgFlow = buf.value.length ? buf.value.reduce((a, b) => a + b, 0) / buf.value.length : 0
  return ((avgFlow * acqStore.elapsedSec) / 60).toFixed(1)
})
const ripplePct = computed(() => {
  const b = buf.value
  if (b.length < 2) return '0.0'
  const avg = b.reduce((a, v) => a + v, 0) / b.length
  if (!avg) return '0.0'
  return (((Math.max(...b) - Math.min(...b)) / 2 / avg) * 100).toFixed(1)
})
const rippleCls = computed(() => {
  const r = parseFloat(ripplePct.value)
  return r > 10 ? 'text-red' : r > 5 ? 'text-amber' : 'text-green'
})

function drawGauge(val: number) {
  const canvas = gaugeCanvas.value
  if (!canvas) return
  const ctx = canvas.getContext('2d')!
  const w = canvas.width,
    h = canvas.height
  ctx.clearRect(0, 0, w, h)
  const cx = w / 2,
    cy = h / 2,
    r = 33
  const frac = Math.max(0, Math.min(1, val / maxFlow))

  ctx.beginPath()
  ctx.arc(cx, cy, r, -Math.PI * 0.8, Math.PI * 0.8)
  ctx.strokeStyle = '#1a2d40'
  ctx.lineWidth = 7
  ctx.stroke()

  if (frac > 0) {
    ctx.beginPath()
    ctx.arc(cx, cy, r, -Math.PI * 0.8, -Math.PI * 0.8 + frac * Math.PI * 1.6)
    ctx.strokeStyle = '#00d9ff'
    ctx.lineWidth = 7
    ctx.shadowColor = '#00d9ff'
    ctx.shadowBlur = 8
    ctx.stroke()
    ctx.shadowBlur = 0
  }
  ctx.fillStyle = '#00d9ff'
  ctx.font = 'bold 13px var(--font-mono)'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(val.toFixed(0), cx, cy)
}

useAnimationLoop(() => {
  if (shouldDraw('flow-gauge', 5)) drawGauge(flow.value)
  if (shouldDraw('flow-trend', 5) && buf.value.length >= 2)
    drawTrend(buf.value, '#00d9ff', { min: 0, max: maxFlow, fill: true, fillAlpha: 0.25 })
})
</script>

<style scoped>
.flow-card {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--r2);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.card-header {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 5px 10px;
  border-bottom: 1px solid var(--border);
  background: var(--bg-2);
  font-size: 11px;
}
.ch-name {
  flex: 1;
  color: var(--text-1);
}
.header-meta {
  font-size: 9.5px;
}
.flow-body {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
}
.gauge-wrap {
  flex-shrink: 0;
}
.flow-stats {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 2px;
  font-size: 10.5px;
}
.stat-row {
  display: flex;
  justify-content: space-between;
}
.stat-row .text-dim {
  font-size: 10px;
}
.text-red {
  color: var(--red);
}
.text-amber {
  color: var(--amber);
}
.text-green {
  color: var(--green);
}
.flow-trend {
  height: 32px;
  padding: 0 4px 4px;
}
</style>
