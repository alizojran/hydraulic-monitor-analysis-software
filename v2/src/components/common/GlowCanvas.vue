<template>
  <div class="canvas-wrap" ref="wrapRef">
    <canvas ref="canvasRef" />
    <slot />
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'

const wrapRef = ref<HTMLDivElement | null>(null)
const canvasRef = ref<HTMLCanvasElement | null>(null)

defineExpose({ canvas: canvasRef })

let observer: ResizeObserver | null = null

onMounted(() => {
  if (!wrapRef.value || !canvasRef.value) return
  observer = new ResizeObserver(() => {
    // Canvas sizing is handled by each GL renderer's resize() method
    // We just need to trigger a redraw on size change - the composables handle this
  })
  observer.observe(wrapRef.value)
})

onUnmounted(() => {
  observer?.disconnect()
})
</script>

<style scoped>
.canvas-wrap {
  position: relative;
  width: 100%;
  height: 100%;
  overflow: hidden;
}
canvas {
  width: 100%;
  height: 100%;
}
</style>
