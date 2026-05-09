<template>
  <div class="rpm-card corners">
    <div class="c-br" /><div class="c-bl" />
    <div class="card-header">
      <span class="mono text-dim">V01</span>
      <span class="text-1">{{ $t('channel.V01') }}</span>
    </div>
    <div class="rpm-body">
      <canvas ref="gaugeCanvas" class="gauge" width="200" height="110" />
      <div class="rpm-val">
        <span class="mono" style="color:var(--cyan);font-size:22px;font-weight:700">{{ Math.round(rpm) }}</span>
        <span class="text-dim" style="font-size:11px">RPM</span>
      </div>
    </div>
    <div class="rpm-trend">
      <GlowCanvas ref="trendCanvas" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useAcquisitionStore } from '@/stores/acquisition'
import { useGLPlot } from '@/composables/useGLPlot'
import { useAnimationLoop, shouldDraw } from '@/composables/useAnimationLoop'
import GlowCanvas from '@/components/common/GlowCanvas.vue'

const acqStore = useAcquisitionStore()
const gaugeCanvas = ref<HTMLCanvasElement | null>(null)
const trendCanvas = ref<InstanceType<typeof GlowCanvas> | null>(null)
const trendRef = computed(() => trendCanvas.value?.canvas ?? null)
const { draw: drawTrend } = useGLPlot(trendRef)

const rpm = computed(() => acqStore.channelValues['V01'] ?? 1500)
const buf = computed(() => acqStore.channelBuffers['V01']?.buffer ?? [])

function drawGauge(rpm: number) {
  const canvas = gaugeCanvas.value
  if (!canvas) return
  const ctx = canvas.getContext('2d')!
  const w = canvas.width, h = canvas.height
  ctx.clearRect(0, 0, w, h)

  const cx = w / 2, cy = h - 16, r = h - 24
  const startAngle = Math.PI
  const endAngle = 0
  const fraction = Math.max(0, Math.min(1, (rpm - 0) / 2400))
  const currentAngle = startAngle + fraction * Math.PI

  // arc background
  ctx.beginPath()
  ctx.arc(cx, cy, r, startAngle, endAngle, false)
  ctx.strokeStyle = '#1a2d40'
  ctx.lineWidth = 10
  ctx.stroke()

  // arc fill
  const grad = ctx.createConicGradient(startAngle, cx, cy)
  grad.addColorStop(0, '#00d9ff')
  grad.addColorStop(fraction, '#00ff95')
  ctx.beginPath()
  ctx.arc(cx, cy, r, startAngle, currentAngle, false)
  ctx.strokeStyle = '#00d9ff'
  ctx.lineWidth = 10
  ctx.shadowColor = '#00d9ff'
  ctx.shadowBlur = 8
  ctx.stroke()
  ctx.shadowBlur = 0

  // tick marks
  for (let i = 0; i <= 12; i++) {
    const a = startAngle + (i / 12) * Math.PI
    const isMajor = i % 3 === 0
    const ro = r + 4, ri = r - (isMajor ? 14 : 8)
    ctx.beginPath()
    ctx.moveTo(cx + ro * Math.cos(a), cy + ro * Math.sin(a))
    ctx.lineTo(cx + ri * Math.cos(a), cy + ri * Math.sin(a))
    ctx.strokeStyle = isMajor ? '#5a7898' : '#2a3d52'
    ctx.lineWidth = isMajor ? 2 : 1
    ctx.stroke()
  }

  // needle
  const needleLen = r - 16
  ctx.beginPath()
  ctx.moveTo(cx, cy)
  ctx.lineTo(cx + needleLen * Math.cos(currentAngle), cy + needleLen * Math.sin(currentAngle))
  ctx.strokeStyle = '#ffffff'
  ctx.lineWidth = 2
  ctx.shadowColor = '#ffffff'
  ctx.shadowBlur = 4
  ctx.stroke()
  ctx.shadowBlur = 0
  ctx.beginPath()
  ctx.arc(cx, cy, 5, 0, Math.PI * 2)
  ctx.fillStyle = '#00d9ff'
  ctx.fill()
}

useAnimationLoop(() => {
  if (shouldDraw('rpm-gauge', 10)) drawGauge(rpm.value)
  if (shouldDraw('rpm-trend', 20) && buf.value.length >= 2) {
    drawTrend(buf.value, '#00d9ff', { min: 0, max: 2400, fill: true, fillAlpha: 0.2 })
  }
})
</script>

<style scoped>
.rpm-card {
  background: var(--bg-card); border: 1px solid var(--border);
  border-radius: var(--r2); display: flex; flex-direction: column; overflow: hidden;
}
.card-header {
  display: flex; align-items: center; gap: 8px;
  padding: 6px 10px; border-bottom: 1px solid var(--border); font-size: 11px;
}
.rpm-body {
  display: flex; flex-direction: column; align-items: center;
  padding: 8px 0 4px;
}
.gauge { display: block; }
.rpm-val { text-align: center; line-height: 1.2; margin-top: -4px; }
.rpm-trend { height: 40px; }
</style>
