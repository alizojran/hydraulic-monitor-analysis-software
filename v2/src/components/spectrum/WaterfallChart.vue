<template>
  <div class="waterfall-wrap">
    <div class="wf-title text-dim">{{ $t('spectrum.waterfall') }}</div>
    <GlowCanvas ref="wfCanvas" class="wf-canvas" />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useDspStore } from '@/stores/dsp'
import { useGLHeatmap } from '@/composables/useGLHeatmap'
import { useAnimationLoop, shouldDraw } from '@/composables/useAnimationLoop'
import GlowCanvas from '@/components/common/GlowCanvas.vue'

const dspStore = useDspStore()

const wfCanvas = ref<InstanceType<typeof GlowCanvas> | null>(null)
const wfRef = computed(() => wfCanvas.value?.canvas ?? null)
const { pushColumn, draw } = useGLHeatmap(wfRef, 128, 360)

// Monotonic counter — works correctly even after the store starts ring-buffering
let lastTotal = 0

useAnimationLoop(() => {
  const hist = dspStore.spectrumHistory
  const total = dspStore.spectrumHistoryTotal

  if (lastTotal === 0) {
    // (Re-)mount: replay all stored columns so the waterfall is restored
    for (let i = 0; i < hist.length; i++) pushColumn(hist[i])
  } else if (total > lastTotal) {
    const newCount = total - lastTotal
    const start = Math.max(0, hist.length - newCount)
    for (let i = start; i < hist.length; i++) pushColumn(hist[i])
  }
  lastTotal = total

  if (shouldDraw('waterfall', 60)) draw()
})
</script>

<style scoped>
.waterfall-wrap { display: flex; flex-direction: column; height: 100%; }
.wf-title { font-size: 10px; letter-spacing: 0.08em; text-transform: uppercase; padding: 4px 8px; }
.wf-canvas { flex: 1; }
</style>
