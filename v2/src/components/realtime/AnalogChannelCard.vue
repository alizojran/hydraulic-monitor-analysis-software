<template>
  <div class="ch-card corners" :class="{ alarm: hasAlarm }">
    <div class="c-br" /><div class="c-bl" />

    <div class="ch-header">
      <span class="ch-id mono">{{ ch.id }} · {{ ch.short }}</span>
      <span class="ch-name">{{ locale === 'zh' ? ch.nameZh : ch.nameEn }}</span>
      <span class="ch-status-dot" :style="{ background: ch.hex, boxShadow: `0 0 6px ${ch.hex}` }" />
    </div>

    <div class="ch-value-row">
      <span class="ch-val mono" :style="{ color: ch.hex, textShadow: `0 0 12px ${ch.hex}66` }">
        {{ displayVal }}<small> {{ ch.unit }}</small>
      </span>
    </div>

    <div class="ch-stats mono">
      <span><span class="text-dim">MIN</span> {{ minVal }}</span>
      <span><span class="text-dim">MAX</span> {{ maxVal }}</span>
      <span><span class="text-dim">RMS</span> <span :style="{color: ch.hex}">{{ rmsVal }}</span></span>
    </div>

    <div class="ch-canvas-wrap">
      <GlowCanvas ref="canvasWrap" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { useAcquisitionStore } from '@/stores/acquisition'
import { useAlarmsStore } from '@/stores/alarms'
import { CHANNEL_MAP } from '@/config/channels'
import { useGLPlot } from '@/composables/useGLPlot'
import { useAnimationLoop, shouldDraw } from '@/composables/useAnimationLoop'
import { computeRms } from '@/dsp/metrics'
import GlowCanvas from '@/components/common/GlowCanvas.vue'
import { useI18n } from 'vue-i18n'

const props = defineProps<{ channelId: string }>()
const { locale } = useI18n()

const acqStore = useAcquisitionStore()
const alarmsStore = useAlarmsStore()
const ch = CHANNEL_MAP.get(props.channelId)!

const canvasWrap = ref<InstanceType<typeof GlowCanvas> | null>(null)
const canvasRef = computed(() => canvasWrap.value?.canvas ?? null)
const { draw } = useGLPlot(canvasRef)

const displayVal = computed(() => {
  const v = acqStore.channelValues[props.channelId] ?? ch.base ?? 0
  return v.toFixed(ch.type === 'temperature' ? 2 : 1)
})

const buf = computed(() => acqStore.channelBuffers[props.channelId]?.buffer ?? [])
const minVal = computed(() => buf.value.length ? Math.min(...buf.value).toFixed(1) : '—')
const maxVal = computed(() => buf.value.length ? Math.max(...buf.value).toFixed(1) : '—')
const rmsVal = computed(() => {
  const b = buf.value
  if (!b.length) return '—'
  const f = new Float32Array(b)
  return computeRms(f).toFixed(1)
})

const hasAlarm = computed(() =>
  alarmsStore.activeEvents.some(e => e.channelId === props.channelId)
)

useAnimationLoop(() => {
  if (!shouldDraw(props.channelId, 5)) return
  const b = buf.value
  if (b.length < 2) return
  draw(b, ch.hex, { min: ch.min, max: ch.max, fill: true, fillAlpha: 0.18 })
})
</script>

<style scoped>
.ch-card {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--r2);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  position: relative;
}
.ch-card.alarm { border-color: var(--red); box-shadow: 0 0 12px rgba(255,51,85,0.18); }

.ch-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 5px 9px;
  border-bottom: 1px solid var(--border);
  background: var(--bg-2);
}
.ch-id { font-size: 10px; color: var(--text-2); letter-spacing: 0.06em; }
.ch-name {
  flex: 1; font-size: 11px; color: var(--text-1);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.ch-status-dot { width: 6px; height: 6px; border-radius: 50%; }

.ch-value-row { padding: 8px 10px 2px; }
.ch-val {
  font-size: 26px; font-weight: 700; letter-spacing: 0.02em; line-height: 1.05;
}
.ch-val small { font-size: 11px; font-weight: 500; color: var(--text-2); margin-left: 3px; }

.ch-stats {
  display: flex; justify-content: space-between;
  padding: 2px 10px 4px; font-size: 10px; color: var(--text-1);
}
.ch-stats .text-dim { margin-right: 3px; letter-spacing: 0.04em; }

.ch-canvas-wrap { flex: 1; min-height: 38px; padding: 0 4px 4px; }
</style>
