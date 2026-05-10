import { defineStore } from 'pinia'
import { ref, reactive, computed } from 'vue'
import { DISPLAY_POINTS, CHANNEL_DEFS, TIME_WINDOWS } from '@/config/channels'
import type { SampleFrame } from '@/types/channel'

export type DataSource = 'simulated' | 'csv' | 'wav' | 'webserial' | 'websocket' | 'modbus'

class TimeWindowBuffer {
  points: number[]
  minPoints: number[]
  maxPoints: number[]
  acc = { sum: 0, min: Infinity, max: -Infinity, count: 0 }
  lastEmitTime = 0
  lastValue: number
  filledCount = 0
  private _pointIntervalMs: number

  constructor(initial = 0, pointIntervalMs = 500) {
    this.lastValue = initial
    this._pointIntervalMs = pointIntervalMs
    this.points = new Array(DISPLAY_POINTS).fill(initial)
    this.minPoints = new Array(DISPLAY_POINTS).fill(initial)
    this.maxPoints = new Array(DISPLAY_POINTS).fill(initial)
  }

  setInterval(ms: number) {
    this._pointIntervalMs = ms
  }

  push(value: number, now: number) {
    if (this.lastEmitTime === 0) this.lastEmitTime = now
    this.acc.sum += value
    if (value < this.acc.min) this.acc.min = value
    if (value > this.acc.max) this.acc.max = value
    this.acc.count++
    this.lastValue = value

    while (now - this.lastEmitTime >= this._pointIntervalMs) {
      const avg = this.acc.count > 0 ? this.acc.sum / this.acc.count : value
      const mn = this.acc.count > 0 ? this.acc.min : value
      const mx = this.acc.count > 0 ? this.acc.max : value
      this.points.shift(); this.points.push(avg)
      this.minPoints.shift(); this.minPoints.push(mn)
      this.maxPoints.shift(); this.maxPoints.push(mx)
      if (this.filledCount < DISPLAY_POINTS) this.filledCount++
      this.acc = { sum: value, min: value, max: value, count: 1 }
      this.lastEmitTime += this._pointIntervalMs
      if (now - this.lastEmitTime > this._pointIntervalMs * DISPLAY_POINTS) {
        this.lastEmitTime = now; break
      }
    }
  }

  reset(value?: number) {
    const v = value ?? this.lastValue
    this.points.fill(v); this.minPoints.fill(v); this.maxPoints.fill(v)
    this.acc = { sum: 0, min: Infinity, max: -Infinity, count: 0 }
    this.lastEmitTime = 0; this.filledCount = 0
  }

  get buffer(): number[] {
    if (this.filledCount === 0) return []
    if (this.filledCount >= DISPLAY_POINTS) return this.points
    return this.points.slice(DISPLAY_POINTS - this.filledCount)
  }

  get fillFraction() { return this.filledCount / DISPLAY_POINTS }
}

export const useAcquisitionStore = defineStore('acquisition', () => {
  const dataSource = ref<DataSource>('simulated')
  const isRunning = ref(false)
  const isPaused = ref(false)
  const timeWindowSec = ref(300)
  const sampleRate = ref(10000)
  const sessionStartTime = ref<number | null>(null)
  const elapsedSec = ref(0)

  // Per-channel time-window buffers
  const channelBuffers = reactive<Record<string, TimeWindowBuffer>>(
    Object.fromEntries(CHANNEL_DEFS.map(ch => [ch.id, new TimeWindowBuffer(ch.base ?? 0, (timeWindowSec.value * 1000) / DISPLAY_POINTS)]))
  )

  // Current instantaneous values for display
  const channelValues = reactive<Record<string, number>>(
    Object.fromEntries(CHANNEL_DEFS.map(ch => [ch.id, ch.base ?? 0]))
  )

  // Raw sample buffer for FFT (last N samples per channel)
  const FFT_BUF_SIZE = 16384
  const fftBuffers = reactive<Record<string, Float32Array>>(
    Object.fromEntries(CHANNEL_DEFS.map(ch => [ch.id, new Float32Array(FFT_BUF_SIZE)]))
  )
  const fftBufHead = reactive<Record<string, number>>(
    Object.fromEntries(CHANNEL_DEFS.map(ch => [ch.id, 0]))
  )

  // For file playback
  const loadedFrames = ref<SampleFrame[]>([])
  const loadedSampleRate = ref(1000)
  const playbackPosition = ref(0)

  // Acoustic spectrogram column history (persists across tab switches)
  const ACOUSTIC_SPEC_DEPTH = 240
  const acousticSpectrogram = ref<Float32Array[]>([])
  // Monotonic count of columns ever pushed — lets consumers detect new
  // columns even after the array starts ring-buffering at the cap.
  const acousticSpectrogramTotal = ref(0)
  function pushAcousticColumn(col: Float32Array) {
    const arr = acousticSpectrogram.value
    arr.push(col)
    if (arr.length > ACOUSTIC_SPEC_DEPTH) arr.shift()
    acousticSpectrogramTotal.value++
  }
  function clearAcousticSpectrogram() {
    acousticSpectrogram.value = []
    acousticSpectrogramTotal.value = 0
  }

  const pointIntervalMs = computed(() => (timeWindowSec.value * 1000) / DISPLAY_POINTS)

  function start() {
    isRunning.value = true
    isPaused.value = false
    sessionStartTime.value = Date.now()
    elapsedSec.value = 0
  }

  function stop() {
    isRunning.value = false
    isPaused.value = false
    sessionStartTime.value = null
  }

  function pause() { isPaused.value = true }
  function resume() { isPaused.value = false }

  function setTimeWindow(seconds: number) {
    timeWindowSec.value = seconds
    const intervalMs = (seconds * 1000) / DISPLAY_POINTS
    for (const id in channelBuffers) {
      channelBuffers[id].setInterval(intervalMs)
      channelBuffers[id].reset()
    }
  }

  // pushFrame is called at simulator rate (1 kHz). We must keep the FFT ring
  // buffer fully populated (every sample) for the FFT worker, but the
  // *reactive* channelValues only need to refresh at ~60 Hz — otherwise we
  // fire 1 kHz × 13 ch = 13 000+ reactive triggers per second, dragging the
  // browser into constant micro-task / GC churn (visible as continuous
  // disk + memory activity even though we never write a file).
  let lastFlushT = 0
  const FLUSH_MS = 16
  function pushFrame(frame: SampleFrame) {
    const now = frame.timestamp
    const flushReactive = now - lastFlushT >= FLUSH_MS
    if (flushReactive) lastFlushT = now
    frame.channels.forEach((value, id) => {
      if (channelBuffers[id]) channelBuffers[id].push(value, now)
      if (fftBuffers[id]) {
        const head = fftBufHead[id]
        fftBuffers[id][head % FFT_BUF_SIZE] = value
        fftBufHead[id] = (head + 1) % FFT_BUF_SIZE
      }
      if (flushReactive) channelValues[id] = value
    })
    if (sessionStartTime.value && flushReactive) {
      elapsedSec.value = (now - sessionStartTime.value) / 1000
    }
  }

  function setDataSource(source: DataSource) {
    dataSource.value = source
  }

  function loadFrames(frames: SampleFrame[], detectedRate: number) {
    loadedFrames.value = frames
    loadedSampleRate.value = detectedRate
    playbackPosition.value = 0
  }

  function getFftSamples(channelId: string, size: number): Float32Array {
    const buf = fftBuffers[channelId]
    if (!buf) return new Float32Array(size)
    const head = fftBufHead[channelId]
    const result = new Float32Array(size)
    for (let i = 0; i < size; i++) {
      result[i] = buf[(head - size + i + FFT_BUF_SIZE) % FFT_BUF_SIZE]
    }
    return result
  }

  return {
    dataSource, isRunning, isPaused, timeWindowSec, sampleRate,
    sessionStartTime, elapsedSec, channelBuffers, channelValues,
    loadedFrames, loadedSampleRate, playbackPosition, pointIntervalMs,
    acousticSpectrogram, acousticSpectrogramTotal, pushAcousticColumn, clearAcousticSpectrogram,
    start, stop, pause, resume, setTimeWindow, pushFrame, setDataSource, loadFrames, getFftSamples,
  }
})
