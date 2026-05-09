<template>
  <div class="flow-card corners">
    <div class="c-br" /><div class="c-bl" />
    <div class="card-header">
      <span class="mono text-dim">F01</span>
      <span class="text-1">{{ $t('channel.F01') }}</span>
      <span class="mono" style="color:var(--cyan)">{{ flowVal }} <small>L/min</small></span>
    </div>
    <div class="flow-body">
      <canvas ref="gaugeCanvas" width="90" height="90" />
      <div class="flow-trend">
        <GlowCanvas ref="trendCanvas" />
      </div>
    </div>
    <div class="flow-footer">
      <span class="text-dim">min <span class="mono">{{ minV }}</span></span>
      <span class="text-dim">avg <span class="mono text-1">{{ avgV }}</span></span>
      <span class="text-dim">max <span class="mono">{{ maxV }}</span></span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useAcquisitionStore } from '@/stores/acquisition'
import { useGLPlot } from '@/composables/useGLPlot'
import { useAnimationLoop, shouldDraw } from '@/composables/useAnimationLoop'
import GlowCanvas from '@/components/common/GlowCanvas.vue'

const acqStore = useAcquisitionStore()
const gaugeCanvas = ref<HTMLCanvasElement | null>(null)
const trendCanvas = ref<InstanceType<typeof GlowCanvas> | null>(null)
const trendRef = computed(() => trendCanvas.value?.canvas ?? null)
const { draw: drawTrend } = useGLPlot(trendRef)

const flow = computed(() => acqStore.channelValues['F01'] ?? 0)
const buf = computed(() => acqStore.channelBuffers['F01']?.buffer ?? [])
const flowVal = computed(() => flow.value.toFixed(1))
const minV = computed(() => buf.value.length ? Math.min(...buf.value).toFixed(0) : '—')
const maxV = computed(() => buf.value.length ? Math.max(...buf.value).toFixed(0) : '—')
const avgV = computed(() => buf.value.length ? (buf.value.reduce((a, b) => a + b, 0) / buf.value.length).toFixed(0) : '—')

function drawGauge(val: number) {
  const canvas = gaugeCanvas.value
  if (!canvas) return
  const ctx = canvas.getContext('2d')!
  const w = canvas.width, h = canvas.height
  ctx.clearRect(0, 0, w, h)
  const cx = w / 2, cy = h / 2, r = 36
  const frac = Math.max(0, Math.min(1, val / 200))

  ctx.beginPath()
  ctx.arc(cx, cy, r, -Math.PI * 0.8, Math.PI * 0.8, false)
  ctx.strokeStyle = '#1a2d40'
  ctx.lineWidth = 8
  ctx.stroke()

  if (frac > 0) {
    ctx.beginPath()
    ctx.arc(cx, cy, r, -Math.PI * 0.8, -Math.PI * 0.8 + frac * Math.PI * 1.6, false)
    ctx.strokeStyle = '#00d9ff'
    ctx.shadowColor = '#00d9ff'
    ctx.shadowBlur = 10
    ctx.stroke()
    ctx.shadowBlur = 0
  }

  ctx.fillStyle = '#00d9ff'
  ctx.font = 'bold 14px var(--font-mono)'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(val.toFixed(0), cx, cy)
}

useAnimationLoop(() => {
  if (shouldDraw('flow-gauge', 10)) drawGauge(flow.value)
  if (shouldDraw('flow-trend', 20) && buf.value.length >= 2) {
    drawTrend(buf.value, '#00d9ff', { min: 0, max: 200, fill: true, fillAlpha: 0.25 })
  }
})
</script>

<style scoped>
.flow-card {
  background: var(--bg-card); border: 1px solid var(--border);
  border-radius: var(--r2); display: flex; flex-direction: column; overflow: hidden;
}
.card-header {
  display: flex; align-items: center; gap: 8px;
  padding: 6px 10px; border-bottom: 1px solid var(--border); font-size: 11px;
}
.card-header > span:nth-child(2) { flex: 1; }
.card-header small { font-size: 10px; color: var(--text-2); }
.flow-body { display: flex; gap: 8px; padding: 8px 10px; align-items: center; }
.flow-trend { flex: 1; height: 80px; }
.flow-footer {
  display: flex; justify-content: space-between;
  padding: 4px 10px; border-top: 1px solid var(--border); font-size: 11px;
}
</style>
