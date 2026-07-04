<template>
  <div class="stats-card donut-card">
    <div class="sc-head">
      <span class="sc-title">{{ $t('alarms.severity.label') }}</span>
    </div>
    <div class="donut-wrap">
      <canvas ref="donutCanvas" width="120" height="120" />
      <div class="donut-legend">
        <div v-for="s in severityStats" :key="s.key" class="legend-row">
          <span class="dot" :style="{ background: s.color }" />
          <span class="lg-label">{{ $t(`alarms.severity.${s.key}`) }}</span>
          <span class="lg-val mono">{{ s.count }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, nextTick } from 'vue'
import { useAlarmsStore } from '@/stores/alarms'
import { useI18n } from 'vue-i18n'

const { locale, t } = useI18n()
const alarmsStore = useAlarmsStore()
const donutCanvas = ref<HTMLCanvasElement | null>(null)

const SEVERITY_COLORS: Record<string, string> = {
  high: '#ff3355',
  warn: '#ffaa00',
  low: '#00d9ff',
  info: '#5a7898',
}

const severityStats = computed(() => {
  const counts: Record<string, number> = { high: 0, warn: 0, low: 0, info: 0 }
  for (const ev of alarmsStore.events) {
    counts[ev.severity] = (counts[ev.severity] ?? 0) + 1
  }
  return (['high', 'warn', 'low', 'info'] as const).map((k) => ({
    key: k,
    count: counts[k],
    color: SEVERITY_COLORS[k],
  }))
})

function draw() {
  const canvas = donutCanvas.value
  if (!canvas) return
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  const w = canvas.width,
    h = canvas.height
  ctx.clearRect(0, 0, w, h)
  const cx = w / 2,
    cy = h / 2,
    r = 48,
    ring = 14

  const stats = severityStats.value
  const total = stats.reduce((a, b) => a + b.count, 0)

  if (total === 0) {
    ctx.beginPath()
    ctx.arc(cx, cy, r, 0, Math.PI * 2)
    ctx.lineWidth = ring
    ctx.strokeStyle = 'rgba(90,120,152,0.25)'
    ctx.stroke()
  } else {
    let start = -Math.PI / 2
    for (const s of stats) {
      if (!s.count) continue
      const sweep = (s.count / total) * Math.PI * 2
      ctx.beginPath()
      ctx.arc(cx, cy, r, start, start + sweep)
      ctx.lineWidth = ring
      ctx.strokeStyle = s.color
      ctx.stroke()
      start += sweep
    }
  }

  ctx.fillStyle = '#e8f0f8'
  ctx.font = 'bold 22px ui-monospace, monospace'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(String(total), cx, cy - 4)
  ctx.fillStyle = '#5a7898'
  ctx.font = '9px ui-monospace, monospace'
  ctx.fillText(t('alarms.total'), cx, cy + 12)
}

onMounted(() => nextTick(draw))
watch(
  () => alarmsStore.events.length,
  () => nextTick(draw),
)
watch(locale, () => nextTick(draw))
</script>

<style scoped>
.stats-card {
  background: var(--bg-2);
  border: 1px solid var(--border);
  border-radius: var(--r);
  padding: 8px 10px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.sc-head {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
}
.sc-title {
  font-size: 10px;
  color: var(--text-2);
  letter-spacing: 0.1em;
  text-transform: uppercase;
}
.donut-card {
  padding: 8px 12px;
}
.donut-wrap {
  display: flex;
  align-items: center;
  gap: 12px;
}
.donut-legend {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 10.5px;
}
.legend-row {
  display: flex;
  align-items: center;
  gap: 6px;
}
.legend-row .dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
}
.lg-label {
  flex: 1;
  color: var(--text-1);
}
.lg-val {
  color: var(--text-0);
  font-weight: 600;
}
</style>
