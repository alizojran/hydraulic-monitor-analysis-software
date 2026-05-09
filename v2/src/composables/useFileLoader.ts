import { useAcquisitionStore } from '@/stores/acquisition'
import { useUiStore } from '@/stores/ui'
import { CHANNEL_DEFS } from '@/config/channels'
import type { SampleFrame } from '@/types/channel'

export function useFileLoader() {
  const acqStore = useAcquisitionStore()
  const uiStore = useUiStore()

  async function loadCsv(file: File): Promise<void> {
    uiStore.setLoading(true, 0, file.name)
    try {
      const text = await file.text()
      const worker = new Worker(new URL('../workers/csv-parser.worker.ts', import.meta.url), { type: 'module' })

      await new Promise<void>((resolve, reject) => {
        worker.onmessage = (e) => {
          if (e.data.type === 'progress') {
            uiStore.setLoading(true, e.data.percent, file.name)
          } else if (e.data.type === 'done') {
            const { channels, timestamps, detectedSampleRate } = e.data

            // Map parsed columns to channel IDs
            const frames: SampleFrame[] = timestamps.map((ts: number, row: number) => {
              const chMap = new Map<string, number>()
              channels.forEach((ch: { id: string, samples: number[] }, ci: number) => {
                // try to match by id, then by position
                const def = CHANNEL_DEFS.find(d => d.id.toLowerCase() === ch.id || d.nameEn.toLowerCase().includes(ch.id)) ?? CHANNEL_DEFS[ci]
                if (def) chMap.set(def.id, ch.samples[row] ?? 0)
              })
              return { timestamp: ts, channels: chMap }
            })

            acqStore.setDataSource('csv')
            acqStore.loadFrames(frames, detectedSampleRate)
            worker.terminate()
            resolve()
          }
        }
        worker.onerror = (e) => { worker.terminate(); reject(e) }
        worker.postMessage({ type: 'parse', text, requestId: 1 })
      })
    } finally {
      uiStore.setLoading(false)
    }
  }

  async function loadWav(file: File): Promise<void> {
    uiStore.setLoading(true, 0, file.name)
    try {
      const arrayBuffer = await file.arrayBuffer()
      const audioCtx = new AudioContext()
      const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer)
      await audioCtx.close()

      const sampleRate = audioBuffer.sampleRate
      const channelCount = audioBuffer.numberOfChannels
      const length = audioBuffer.length

      const chDef = channelCount >= 2
        ? [CHANNEL_DEFS.find(c => c.type === 'vibration'), CHANNEL_DEFS.find(c => c.type === 'acoustic')]
        : [CHANNEL_DEFS.find(c => c.type === 'acoustic')]

      const rawChannels = Array.from({ length: channelCount }, (_, i) => audioBuffer.getChannelData(i))

      // Build frames at 1ms intervals (downsample if needed)
      const stride = Math.max(1, Math.floor(sampleRate / 1000))
      const frames: SampleFrame[] = []
      const startTs = Date.now() - (length / sampleRate) * 1000

      for (let i = 0; i < length; i += stride) {
        const ts = startTs + (i / sampleRate) * 1000
        const chMap = new Map<string, number>()
        rawChannels.forEach((ch, ci) => {
          const def = chDef[ci]
          if (def) chMap.set(def.id, ch[i])
        })
        frames.push({ timestamp: ts, channels: chMap })
        if (i % 10000 === 0) uiStore.setLoading(true, Math.round(i / length * 100), file.name)
      }

      acqStore.setDataSource('wav')
      acqStore.loadFrames(frames, Math.round(sampleRate / stride))
    } finally {
      uiStore.setLoading(false)
    }
  }

  return { loadCsv, loadWav }
}
