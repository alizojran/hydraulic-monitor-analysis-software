import { onMounted, onUnmounted } from 'vue'
import { useUiStore } from '@/stores/ui'

type LoopCallback = (now: number) => void

const callbacks = new Set<LoopCallback>()
let rafId: number | null = null
let frameCount = 0
let lastFpsTime = 0
let uiStore: ReturnType<typeof useUiStore> | null = null

function tick(now: number) {
  rafId = requestAnimationFrame(tick)
  frameCount++
  if (now - lastFpsTime >= 1000) {
    if (uiStore) uiStore.setFps(Math.round((frameCount * 1000) / (now - lastFpsTime)))
    frameCount = 0
    lastFpsTime = now
  }
  for (const cb of callbacks) {
    try {
      cb(now)
    } catch (e) {
      console.error('rAF callback error:', e)
    }
  }
}

function startLoop() {
  if (rafId !== null) return
  lastFpsTime = performance.now()
  rafId = requestAnimationFrame(tick)
}

function stopLoop() {
  if (rafId !== null) {
    cancelAnimationFrame(rafId)
    rafId = null
  }
}

// drawTimes for per-key rate limiting
const drawTimes = new Map<string, number>()

export function shouldDraw(key: string, fps: number): boolean {
  const now = performance.now()
  const interval = 1000 / fps
  const last = drawTimes.get(key) ?? 0
  if (now - last >= interval - 1) {
    drawTimes.set(key, now)
    return true
  }
  return false
}

export function useAnimationLoop(callback: LoopCallback) {
  onMounted(() => {
    try {
      uiStore = useUiStore()
    } catch {
      /* useUiStore not yet mounted */
    }
    // Clear throttle timestamps so the first frame after (re-)mount draws
    // immediately — important when switching tabs (v-if) so curves don't
    // sit blank for the rate-limit interval.
    drawTimes.clear()
    callbacks.add(callback)
    startLoop()
  })
  onUnmounted(() => {
    callbacks.delete(callback)
    if (callbacks.size === 0) stopLoop()
  })
}

/** Force the next shouldDraw(key) call to return true. */
export function invalidateThrottle(key?: string) {
  if (key) drawTimes.delete(key)
  else drawTimes.clear()
}
