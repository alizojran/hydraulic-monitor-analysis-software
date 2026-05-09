import { ref, onMounted, onUnmounted, type Ref } from 'vue'
import { GLHeatmap } from '@/gl/GLHeatmap'

export function useGLHeatmap(canvasRef: Ref<HTMLCanvasElement | null>, freqBins = 128, timeCols = 256) {
  let heatmap: GLHeatmap | null = null
  const isAvailable = ref(false)

  onMounted(() => {
    if (canvasRef.value) {
      heatmap = new GLHeatmap(canvasRef.value, freqBins, timeCols)
      isAvailable.value = !heatmap.failed
    }
  })

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
