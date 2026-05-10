<template>
  <div class="octave-wrap">
    <div class="oct-header">
      <span class="text-dim" style="font-size: 10px">{{ $t('spectrum.octave') }}</span>
      <div class="seg">
        <button
          v-for="w in WEIGHTINGS"
          :key="w"
          class="seg-btn"
          :class="{ active: dspStore.octaveWeighting === w }"
          @click="dspStore.setOctaveWeighting(w)"
        >
          {{ w === 'none' ? $t('spectrum.noWeighting') : w }}
        </button>
      </div>
    </div>
    <GlowCanvas ref="barsCanvas" class="bars-canvas" />
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { useDspStore } from '@/stores/dsp'
import { useGLBars } from '@/composables/useGLBars'
import { useAnimationLoop, shouldDraw } from '@/composables/useAnimationLoop'
import { computeOctaveBands } from '@/dsp/octave'
import GlowCanvas from '@/components/common/GlowCanvas.vue'
import { CHANNEL_MAP } from '@/config/channels'

const WEIGHTINGS: ('A' | 'C' | 'none')[] = ['A', 'C', 'none']
const dspStore = useDspStore()

const barsCanvas = ref<InstanceType<typeof GlowCanvas> | null>(null)
const barsRef = computed(() => barsCanvas.value?.canvas ?? null)
const { draw } = useGLBars(barsRef)

const ch = computed(() => CHANNEL_MAP.get(dspStore.selectedChannelId))

useAnimationLoop(() => {
  if (!shouldDraw('octave', 60)) return
  const res = dspStore.fftResult
  if (!res) return
  const bands = computeOctaveBands(res.magnitudeDb, res.frequencies, dspStore.octaveWeighting)
  draw(bands, ch.value?.hex ?? '#00ff95')
})
</script>

<style scoped>
.octave-wrap {
  display: flex;
  flex-direction: column;
  height: 100%;
}
.oct-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 4px 8px;
  border-bottom: 1px solid var(--border);
}
.seg {
  display: flex;
  border: 1px solid var(--border);
  border-radius: var(--r);
  overflow: hidden;
}
.seg-btn {
  background: transparent;
  border: none;
  border-right: 1px solid var(--border);
  padding: 2px 8px;
  font-size: 10px;
  color: var(--text-2);
  cursor: pointer;
}
.seg-btn:last-child {
  border-right: none;
}
.seg-btn.active {
  background: rgba(0, 217, 255, 0.1);
  color: var(--cyan);
}
.bars-canvas {
  flex: 1;
}
</style>
