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

let lastHistLen = 0

useAnimationLoop(() => {
  const hist = dspStore.spectrumHistory
  if (hist.length > lastHistLen) {
    for (let i = lastHistLen; i < hist.length; i++) {
      pushColumn(hist[i])
    }
    lastHistLen = hist.length
  }
  if (shouldDraw('waterfall', 15)) draw()
})
</script>

<style scoped>
.waterfall-wrap { display: flex; flex-direction: column; height: 100%; }
.wf-title { font-size: 10px; letter-spacing: 0.08em; text-transform: uppercase; padding: 4px 8px; }
.wf-canvas { flex: 1; }
</style>
