<template>
  <div class="ch-card corners">
    <div class="c-br" /><div class="c-bl" />
    <div class="ch-header">
      <span class="ch-id mono">{{ ch.id }}</span>
      <span class="ch-name">{{ locale === 'zh' ? ch.nameZh : ch.nameEn }}</span>
      <span class="ch-val mono" :style="{ color: ch.hex }">{{ displayVal }} <small>{{ ch.unit }}</small></span>
    </div>
    <div class="ch-canvas-wrap">
      <GlowCanvas ref="canvasWrap" />
    </div>
    <div class="ch-footer">
      <span class="text-dim">min <span class="mono">{{ minVal }}</span></span>
      <span class="text-dim">rms <span class="mono text-1">{{ rmsVal }}</span></span>
      <span class="text-dim">max <span class="mono">{{ maxVal }}</span></span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useAcquisitionStore } from '@/stores/acquisition'
import { CHANNEL_MAP } from '@/config/channels'
import { useGLPlot } from '@/composables/useGLPlot'
import { useAnimationLoop, shouldDraw } from '@/composables/useAnimationLoop'
import { computeRms } from '@/dsp/metrics'
import GlowCanvas from '@/components/common/GlowCanvas.vue'
import { useI18n } from 'vue-i18n'

const props = defineProps<{ channelId: string }>()
const { locale } = useI18n()

const acqStore = useAcquisitionStore()
const ch = CHANNEL_MAP.get(props.channelId)!

const canvasWrap = ref<InstanceType<typeof GlowCanvas> | null>(null)
const canvasRef = computed(() => canvasWrap.value?.canvas ?? null)
const { draw } = useGLPlot(canvasRef)

const displayVal = computed(() => {
  const v = acqStore.channelValues[props.channelId] ?? ch.base ?? 0
  return v.toFixed(ch.type === 'temperature' ? 1 : 0)
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

useAnimationLoop(() => {
  if (!shouldDraw(props.channelId, 20)) return
  const b = buf.value
  if (b.length < 2) return
  draw(b, ch.hex, { min: ch.min, max: ch.max, fill: true, fillAlpha: 0.25 })
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
}
.ch-header {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  border-bottom: 1px solid var(--border);
}
.ch-id { font-size: 11px; color: var(--text-2); min-width: 36px; }
.ch-name { flex: 1; font-size: 11px; color: var(--text-1); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ch-val { font-size: 14px; font-weight: 600; }
.ch-val small { font-size: 10px; font-weight: 400; color: var(--text-2); }
.ch-canvas-wrap { flex: 1; min-height: 60px; }
.ch-footer {
  display: flex;
  justify-content: space-between;
  padding: 4px 10px;
  border-top: 1px solid var(--border);
  font-size: 11px;
}
</style>
