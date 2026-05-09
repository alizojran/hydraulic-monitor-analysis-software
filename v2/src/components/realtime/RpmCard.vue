<template>
  <div class="rpm-card corners">
    <div class="c-br" /><div class="c-bl" />
    <div class="card-header">
      <span class="mono ch-id text-dim">V01 · N</span>
      <span class="ch-name">{{ $t('channel.V01') }}</span>
      <span class="header-meta mono">{{ status }}</span>
    </div>

    <div class="rpm-body">
      <canvas ref="gaugeCanvas" class="gauge" width="180" height="92" />
      <div class="rpm-val">
        <span class="mono rpm-num">{{ Math.round(rpm) }}</span>
        <span class="text-dim rpm-unit">RPM</span>
      </div>
    </div>

    <div class="rpm-stats mono">
      <div class="stat-row">
        <span class="text-dim">{{ $t('rpm.nominal') }}</span>
        <span>{{ nominal }} RPM</span>
      </div>
      <div class="stat-row">
        <span class="text-dim">{{ $t('rpm.deviation') }}</span>
        <span :class="devCls">{{ devSign }}{{ deviation }}%</span>
      </div>
      <div class="stat-row">
        <span class="text-dim">{{ $t('rpm.acceleration') }}</span>
        <span :class="accCls">{{ accSign }}{{ acceleration }} RPM/s</span>
      </div>
      <div class="stat-row">
        <span class="text-dim">{{ $t('rpm.runtime') }}</span>
        <span class="text-1">{{ runtime }}</span>
      </div>
    </div>

    <div class="rpm-trend">
      <GlowCanvas ref="trendCanvas" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { useAcquisitionStore } from '@/stores/acquisition'
import { CHANNEL_MAP } from '@/config/channels'
import { useGLPlot } from '@/composables/useGLPlot'
import { useAnimationLoop, shouldDraw } from '@/composables/useAnimationLoop'
import GlowCanvas from '@/components/common/GlowCanvas.vue'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()
const acqStore = useAcquisitionStore()
const gaugeCanvas = ref<HTMLCanvasElement | null>(null)
const trendCanvas = ref<InstanceType<typeof GlowCanvas> | null>(null)
const trendRef = computed(() => trendCanvas.value?.canvas ?? null)
const { draw: drawTrend } = useGLPlot(trendRef)

const rpm = computed(() => acqStore.channelValues['V01'] ?? 1500)
const buf = computed(() => acqStore.channelBuffers['V01']?.buffer ?? [])
const nominal = CHANNEL_MAP.get('V01')?.nominalRpm ?? 1500

const deviation = computed(() => {
  const dev = ((rpm.value - nominal) / nominal) * 100
  return Math.abs(dev).toFixed(1)
})
const devSign = computed(() => (rpm.value - nominal) >= 0 ? '+' : '-')
const devCls = computed(() => {
  const d = Math.abs((rpm.value - nominal) / nominal) * 100
  if (d > 5) return 'text-red'
  if (d > 2) return 'text-amber'
  return 'text-green'
})

let lastRpm = nominal
let lastT = Date.now()
const acc = ref(0)

const acceleration = computed(() => Math.abs(acc.value).toFixed(1))
const accSign = computed(() => acc.value >= 0 ? '+' : '-')
const accCls = computed(() => Math.abs(acc.value) > 20 ? 'text-amber' : '')

const runtime = computed(() => {
  const s = Math.max(0, Math.floor(acqStore.elapsedSec))
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60
  const pad = (n: number) => String(n).padStart(2, '0')
  return h > 0 ? `${pad(h)}:${pad(m)}:${pad(sec)}` : `${pad(m)}:${pad(sec)}`
})

const status = computed(() => {
  if (!acqStore.isRunning) return t('rpm.statusStopped')
  if (Math.abs(acc.value) < 5) return t('rpm.statusSteady')
  return acc.value > 0 ? t('rpm.statusAccel') : t('rpm.statusDecel')
})

function drawGauge(rpm: number) {
  const canvas = gaugeCanvas.value
  if (!canvas) return
  const ctx = canvas.getContext('2d')!
  const w = canvas.width, h = canvas.height
  ctx.clearRect(0, 0, w, h)

  const cx = w / 2, cy = h - 12, r = h - 20
  const startAngle = Math.PI
  const endAngle = 0
  const fraction = Math.max(0, Math.min(1, (rpm - 0) / 2400))
  const currentAngle = startAngle + fraction * Math.PI

  ctx.beginPath()
  ctx.arc(cx, cy, r, startAngle, endAngle, false)
  ctx.strokeStyle = '#1a2d40'
  ctx.lineWidth = 8
  ctx.stroke()

  ctx.beginPath()
  ctx.arc(cx, cy, r, startAngle, currentAngle, false)
  ctx.strokeStyle = '#00d9ff'
  ctx.lineWidth = 8
  ctx.shadowColor = '#00d9ff'
  ctx.shadowBlur = 6
  ctx.stroke()
  ctx.shadowBlur = 0

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

let accTimer = 0
useAnimationLoop((now) => {
  if (shouldDraw('rpm-gauge', 5)) drawGauge(rpm.value)
  if (shouldDraw('rpm-trend', 5) && buf.value.length >= 2) {
    drawTrend(buf.value, '#00d9ff', { min: 0, max: 2400, fill: true, fillAlpha: 0.2 })
  }
  // Compute acceleration over a 0.5s window
  if (now - accTimer > 500) {
    const dtSec = (now - lastT) / 1000
    if (dtSec > 0) acc.value = (rpm.value - lastRpm) / dtSec
    lastRpm = rpm.value
    lastT = now
    accTimer = now
  }
})
</script>

<style scoped>
.rpm-card {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--r2);
  display: flex; flex-direction: column; overflow: hidden;
}
.card-header {
  display: flex; align-items: center; gap: 8px;
  padding: 5px 10px; border-bottom: 1px solid var(--border);
  background: var(--bg-2);
  font-size: 11px;
}
.ch-id { font-size: 10px; letter-spacing: 0.06em; }
.ch-name { flex: 1; color: var(--text-1); }
.header-meta { font-size: 9.5px; color: var(--green); letter-spacing: 0.06em; }

.rpm-body {
  display: flex; flex-direction: column; align-items: center;
  padding: 4px 0 0;
}
.gauge { display: block; }
.rpm-val {
  display: flex; align-items: baseline; gap: 3px;
  margin-top: -4px;
}
.rpm-num {
  font-size: 20px; font-weight: 700; color: var(--cyan);
  text-shadow: 0 0 12px rgba(0,217,255,0.5);
}
.rpm-unit { font-size: 9px; }

.rpm-stats {
  display: grid; grid-template-columns: 1fr 1fr; gap: 1px 10px;
  padding: 5px 10px; font-size: 10px;
  border-top: 1px solid var(--border);
  background: var(--bg-2);
}
.stat-row { display: flex; justify-content: space-between; gap: 4px; }
.stat-row .text-dim { letter-spacing: 0.04em; font-size: 9.5px; }
.text-red { color: var(--red); }
.text-amber { color: var(--amber); }
.text-green { color: var(--green); }

.rpm-trend { height: 28px; padding: 0 4px 3px; flex-shrink: 0; }
</style>
