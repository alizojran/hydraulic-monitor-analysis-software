import { onUnmounted } from 'vue'
import { useAcquisitionStore } from '@/stores/acquisition'
import { useAlarmsStore } from '@/stores/alarms'
import { CHANNEL_DEFS } from '@/config/channels'
import type { SampleFrame } from '@/types/channel'

// Simulated DAQ rate. Browsers cap setInterval at ~1 ms granularity, so we
// tick at 1 kHz and emit a batch of 10 samples per tick — the data stream
// the rest of the app sees runs at 10 kHz with proper 0.1 ms physical
// spacing between samples.
const SIM_RATE = 10000 // Hz
const SIM_TICK_HZ = 1000
const SAMPLES_PER_TICK = SIM_RATE / SIM_TICK_HZ
const SIM_TICK_MS = 1000 / SIM_TICK_HZ

function genSample(id: string, T: number, rpm: number): number {
  const ch = CHANNEL_DEFS.find(c => c.id === id)
  if (!ch) return 0
  const { base = 0, vary = 0, wave } = ch
  switch (wave) {
    case 'pressure': {
      const rpmHz = rpm / 60
      const pistons = 9
      const ripple = Math.sin(2 * Math.PI * rpmHz * pistons * T) * vary * 0.2
      const slow = Math.sin(2 * Math.PI * 0.08 * T) * vary * 0.6
      const noise = (Math.random() - 0.5) * vary * 0.4
      return base + ripple + slow + noise
    }
    case 'square': {
      const sw = (Math.sin(2 * Math.PI * 0.6 * T) > 0 ? 1 : -1) * vary * 0.6
      const noise = (Math.random() - 0.5) * vary * 0.5
      const hi = Math.sin(2 * Math.PI * 30 * T) * vary * 0.1
      return base + sw + noise + hi
    }
    case 'sine': {
      const phase = id === 'CH08' ? Math.PI / 3 : 0
      const f = id === 'CH08' ? 0.07 : 0.05
      return vary * Math.sin(2 * Math.PI * f * T + phase) + (Math.random() - 0.5) * vary * 0.04
    }
    case 'slow': {
      const drift = Math.sin(2 * Math.PI * 0.003 * T) * vary
      const breath = Math.sin(2 * Math.PI * 0.05 * T) * vary * 0.25
      return base + drift + breath + (Math.random() - 0.5) * vary * 0.08
    }
    case 'noise': {
      return base + (Math.random() - 0.5) * vary * 2
    }
    case 'rpm': {
      return (ch.nominalRpm ?? 1500) + Math.sin(2 * Math.PI * 0.1 * T) * 30 + (Math.random() - 0.5) * 5
    }
    case 'vibration': {
      const rpmHz = rpm / 60
      const freqs = ch.freqs ?? [25, 50]
      let v = 0
      for (let i = 0; i < freqs.length; i++) {
        v += Math.sin(2 * Math.PI * (freqs[i] + rpmHz * i) * T) * vary * (0.5 / (i + 1))
      }
      v += Math.sin(2 * Math.PI * rpmHz * T) * vary * 0.8
      v += (Math.random() - 0.5) * vary * 0.3
      return v
    }
    case 'acoustic': {
      const rpmHz = rpm / 60
      const base_db = ch.base ?? 72
      return base_db + Math.sin(2 * Math.PI * 0.5 * T) * 3
        + Math.sin(2 * Math.PI * rpmHz * T) * 2
        + (Math.random() - 0.5) * 2
    }
    default:
      return base + (Math.random() - 0.5) * vary
  }
}

export function useSimulator() {
  const acqStore = useAcquisitionStore()
  const alarmStore = useAlarmsStore()

  let intervalId: ReturnType<typeof setInterval> | null = null
  let metricsId: ReturnType<typeof setInterval> | null = null
  let startTime = 0
  let sampleIndex = 0

  // Rolling RMS/Peak per channel — refreshed every 250 ms over the last 1 s
  // of raw samples. Plain objects (not reactive) — alarmStore.evaluateFrame
  // reads them by reference each tick, no need to trigger Vue reactivity.
  const channelRms: Record<string, number> = {}
  const channelPeak: Record<string, number> = {}
  const METRICS_WINDOW = 10000   // 1 s @ 10 kHz

  function refreshMetrics() {
    for (const ch of CHANNEL_DEFS) {
      const buf = acqStore.getFftSamples(ch.id, METRICS_WINDOW)
      let sumSq = 0, peak = 0
      for (let i = 0; i < buf.length; i++) {
        const v = buf[i]
        sumSq += v * v
        const a = Math.abs(v)
        if (a > peak) peak = a
      }
      channelRms[ch.id] = Math.sqrt(sumSq / buf.length)
      channelPeak[ch.id] = peak
    }
  }

  function start() {
    startTime = Date.now()
    sampleIndex = 0
    acqStore.start()
    intervalId = setInterval(() => {
      if (!acqStore.isRunning || acqStore.isPaused) return
      const rpm = acqStore.channelValues['V01'] ?? 1500
      let lastFrame: SampleFrame | null = null

      // Emit a batch of SAMPLES_PER_TICK samples spaced at 1/SIM_RATE seconds
      for (let i = 0; i < SAMPLES_PER_TICK; i++) {
        const T = sampleIndex / SIM_RATE
        const ts = startTime + sampleIndex * (1000 / SIM_RATE)
        sampleIndex++
        const frame: SampleFrame = {
          timestamp: ts,
          channels: new Map(CHANNEL_DEFS.map(ch => [ch.id, genSample(ch.id, T, rpm)])),
        }
        acqStore.pushFrame(frame)
        lastFrame = frame
      }
      // Evaluate alarms once per tick (latest sample) with real RMS/Peak
      if (lastFrame) alarmStore.evaluateFrame(lastFrame, channelRms, channelPeak)
    }, SIM_TICK_MS)

    metricsId = setInterval(refreshMetrics, 250)
  }

  function stop() {
    if (intervalId) { clearInterval(intervalId); intervalId = null }
    if (metricsId) { clearInterval(metricsId); metricsId = null }
    acqStore.stop()
  }

  function pause() { acqStore.pause() }
  function resume() { acqStore.resume() }

  onUnmounted(() => {
    if (intervalId) { clearInterval(intervalId); intervalId = null }
    if (metricsId) { clearInterval(metricsId); metricsId = null }
  })

  return { start, stop, pause, resume }
}
