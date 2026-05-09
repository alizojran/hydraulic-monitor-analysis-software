import { ref, onMounted, onUnmounted, type Ref } from 'vue'
import { GLPlot, type PlotOptions } from '@/gl/GLPlot'

export function useGLPlot(canvasRef: Ref<HTMLCanvasElement | null>) {
  let plot: GLPlot | null = null
  const isAvailable = ref(false)

  onMounted(() => {
    if (canvasRef.value) {
      plot = new GLPlot(canvasRef.value)
      isAvailable.value = !plot.failed
    }
  })

  onUnmounted(() => {
    plot?.destroy()
    plot = null
    isAvailable.value = false
  })

  function draw(buf: ArrayLike<number>, hex: string, options?: PlotOptions) {
    if (!plot || plot.failed || !buf || buf.length < 2) return
    plot.draw(buf, hex, options)
  }

  return { draw, isAvailable }
}
