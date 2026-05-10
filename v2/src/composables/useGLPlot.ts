import { ref, watch, onUnmounted, type Ref } from 'vue'
import { GLPlot, type PlotOptions } from '@/gl/GLPlot'

export function useGLPlot(canvasRef: Ref<HTMLCanvasElement | null>) {
  let plot: GLPlot | null = null
  const isAvailable = ref(false)

  // watch+immediate so we lazily create the GL context the moment the
  // canvas becomes available, instead of only at the parent's onMounted —
  // covers any timing edge case where the computed-from-template-ref
  // isn't populated yet at the parent's mounted hook.
  watch(
    canvasRef,
    (canvas) => {
      if (canvas && !plot) {
        plot = new GLPlot(canvas)
        isAvailable.value = !plot.failed
      }
    },
    { immediate: true, flush: 'post' },
  )

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
