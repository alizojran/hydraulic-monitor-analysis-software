<template>
  <div class="stats-card">
    <div class="sc-head">
      <span class="sc-title">{{ $t('alarms.last24h') }}</span>
      <span class="sc-total mono">{{ stats24h.total }}</span>
    </div>
    <canvas ref="histCanvas" class="hist-canvas" width="600" height="80" />
    <div class="hist-axis mono text-dim">
      <span>-24h</span><span>-18h</span><span>-12h</span><span>-6h</span><span>now</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, nextTick } from 'vue'
import { useAlarmsStore } from '@/stores/alarms'
import { useI18n } from 'vue-i18n'

const { locale } = useI18n()
const alarmsStore = useAlarmsStore()
const histCanvas = ref<HTMLCanvasElement | null>(null)

const stats24h = computed(() => {
  const buckets = new Array(24).fill(0)
  const now = Date.now()
  const cutoff = now - 24 * 3600 * 1000
  let total = 0
  for (const ev of alarmsStore.events) {
    if (ev.timestamp < cutoff) continue
    const hoursAgo = Math.floor((now - ev.timestamp) / 3600000)
    const bucket = Math.max(0, Math.min(23, 23 - hoursAgo))
    buckets[bucket]++
    total++
  }
  return { buckets, total }
})

function draw() {
  const canvas = histCanvas.value
  if (!canvas) return
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  const w = canvas.width,
    h = canvas.height
  ctx.clearRect(0, 0, w, h)

  const { buckets } = stats24h.value
  const max = Math.max(1, ...buckets)
  const barW = w / 24
  const gap = barW * 0.18

  for (let i = 0; i < 24; i++) {
    const x = i * barW + gap / 2
    const bw = barW - gap
    const bh = (buckets[i] / max) * (h - 4)
    const y = h - bh
    const hot = buckets[i] >= max * 0.66
    ctx.fillStyle = hot ? 'rgba(255,51,85,0.85)' : 'rgba(0,217,255,0.7)'
    ctx.fillRect(x, y, bw, bh)
    if (hot) {
      ctx.shadowColor = '#ff3355'
      ctx.shadowBlur = 6
      ctx.fillRect(x, y, bw, bh)
      ctx.shadowBlur = 0
    }
  }
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
.sc-total {
  font-size: 16px;
  font-weight: 700;
  color: var(--text-0);
}
.hist-canvas {
  width: 100%;
  height: 80px;
  display: block;
}
.hist-axis {
  display: flex;
  justify-content: space-between;
  font-size: 9px;
  padding: 0 2px;
}
</style>
