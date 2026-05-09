import { ref, onUnmounted } from 'vue'
import { useAcquisitionStore } from '@/stores/acquisition'

/**
 * Play back a loaded SampleFrame[] (CSV / WAV file source) by walking through
 * the array on a wall-clock timer and pushing frames into the acquisition
 * store at the right speed.
 *
 * Singleton — instances share state via the closure of useAcquisitionStore +
 * module-level variables, so play/pause from any component works correctly.
 */
const isPlaying = ref(false)
const isPaused = ref(false)
const speed = ref(1)
const position = ref(0)   // 0..1 fraction through the frame list

let timer: ReturnType<typeof setInterval> | null = null
let idx = 0
let startWall = 0
let startVT = 0

export function usePlayback() {
  const acqStore = useAcquisitionStore()

  function tick() {
    if (isPaused.value) return
    const frames = acqStore.loadedFrames
    if (idx >= frames.length) { stop(); return }

    const elapsedMs = (performance.now() - startWall) * speed.value
    const targetVT = startVT + elapsedMs

    while (idx < frames.length && frames[idx].timestamp <= targetVT) {
      acqStore.pushFrame(frames[idx])
      idx++
    }
    position.value = idx / frames.length
  }

  function play() {
    const frames = acqStore.loadedFrames
    if (!frames.length) return
    if (idx >= frames.length) idx = 0

    isPlaying.value = true
    isPaused.value = false
    startWall = performance.now()
    startVT = frames[idx]?.timestamp ?? 0

    if (!timer) timer = setInterval(tick, 16)
  }

  function pause() { isPaused.value = true }
  function resume() {
    if (!isPaused.value) return
    const frames = acqStore.loadedFrames
    isPaused.value = false
    if (idx < frames.length) {
      startWall = performance.now()
      startVT = frames[idx].timestamp
    }
  }
  function togglePause() {
    if (isPaused.value) resume()
    else pause()
  }

  function stop() {
    if (timer) { clearInterval(timer); timer = null }
    isPlaying.value = false
    isPaused.value = false
    idx = 0
    position.value = 0
  }

  function setSpeed(s: number) {
    const frames = acqStore.loadedFrames
    if (idx < frames.length) {
      startWall = performance.now()
      startVT = frames[idx].timestamp
    }
    speed.value = s
  }

  function seek(pos: number) {
    const frames = acqStore.loadedFrames
    if (!frames.length) return
    idx = Math.max(0, Math.min(frames.length - 1, Math.floor(pos * frames.length)))
    startWall = performance.now()
    startVT = frames[idx].timestamp
    position.value = pos
  }

  onUnmounted(() => {
    // Don't auto-stop — playback is a singleton
  })

  return {
    isPlaying, isPaused, speed, position,
    play, pause, resume, togglePause, stop, setSpeed, seek,
  }
}
