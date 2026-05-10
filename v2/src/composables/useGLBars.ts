import { ref, watch, onUnmounted, type Ref } from 'vue'
import { GLBars } from '@/gl/GLBars'

export function useGLBars(canvasRef: Ref<HTMLCanvasElement | null>) {
  let bars: GLBars | null = null
  const isAvailable = ref(false)

  watch(
    canvasRef,
    (canvas) => {
      if (canvas && !bars) {
        bars = new GLBars(canvas)
        isAvailable.value = !bars.failed
      }
    },
    { immediate: true, flush: 'post' },
  )

  onUnmounted(() => {
    bars?.destroy()
    bars = null
    isAvailable.value = false
  })

  function draw(spec: ArrayLike<number>, hex: string, opts?: { maxScale?: number }) {
    if (!bars || bars.failed) return
    bars.draw(spec, hex, opts)
  }

  return { draw, isAvailable }
}
