import { ref, watch, onUnmounted, type Ref } from 'vue'
import { GLHeatmap } from '@/gl/GLHeatmap'

export function useGLHeatmap(canvasRef: Ref<HTMLCanvasElement | null>, freqBins = 128, timeCols = 256) {
  let heatmap: GLHeatmap | null = null
  const isAvailable = ref(false)

  watch(canvasRef, (canvas) => {
    if (canvas && !heatmap) {
      heatmap = new GLHeatmap(canvas, freqBins, timeCols)
      isAvailable.value = !heatmap.failed
    }
  }, { immediate: true, flush: 'post' })

  onUnmounted(() => {
    heatmap?.destroy()
    heatmap = null
    isAvailable.value = false
  })

  function pushColumn(spec: ArrayLike<number>) {
    if (!heatmap || heatmap.failed) return
    heatmap.pushColumn(spec)
  }

  function draw() {
    if (!heatmap || heatmap.failed) return
    heatmap.draw()
  }

  return { pushColumn, draw, isAvailable }
}
