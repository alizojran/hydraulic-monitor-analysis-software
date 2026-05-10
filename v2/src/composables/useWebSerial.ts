/**
 * useWebSerial — Web Serial API data source.
 *
 * Wire protocol (line-delimited JSON, one frame per line):
 *   {"ts":1234567890,"ch":{"CH01":287.4,"CH02":65.1,...}}
 *
 * Falls back gracefully when the browser does not support Web Serial
 * (non-Chromium, Firefox, Safari) or when running in a Tauri webview that
 * has disabled the serial permission.
 */
import { ref, readonly } from 'vue'
import { useAcquisitionStore } from '@/stores/acquisition'
import type { SampleFrame } from '@/types/channel'
import { CHANNEL_DEFS } from '@/config/channels'

export type SerialStatus = 'disconnected' | 'connecting' | 'connected' | 'error'

// Default baud rates offered in the UI picker
export const BAUD_RATES = [9600, 19200, 38400, 57600, 115200, 230400, 460800, 921600] as const

export function useWebSerial() {
  const acqStore = useAcquisitionStore()

  const isSupported = 'serial' in navigator
  const status = ref<SerialStatus>('disconnected')
  const errorMsg = ref('')
  const bytesReceived = ref(0)
  const framesReceived = ref(0)

  let port: SerialPort | null = null
  let reader: ReadableStreamDefaultReader<Uint8Array> | null = null
  let abortCtrl: AbortController | null = null
  let readLoopActive = false

  const decoder = new TextDecoder()
  let lineBuf = ''

  function parseFrame(line: string): SampleFrame | null {
    try {
      const obj = JSON.parse(line) as { ts: number; ch: Record<string, number> }
      if (typeof obj.ts !== 'number' || typeof obj.ch !== 'object') return null
      const channels = new Map<string, number>()
      for (const def of CHANNEL_DEFS) {
        const v = obj.ch[def.id]
        if (typeof v === 'number') channels.set(def.id, v)
      }
      return channels.size > 0 ? { timestamp: obj.ts, channels } : null
    } catch {
      return null
    }
  }

  function onChunk(chunk: Uint8Array) {
    bytesReceived.value += chunk.byteLength
    lineBuf += decoder.decode(chunk, { stream: true })
    const lines = lineBuf.split('\n')
    lineBuf = lines.pop() ?? ''
    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed) continue
      const frame = parseFrame(trimmed)
      if (frame) {
        acqStore.pushFrame(frame)
        framesReceived.value++
      }
    }
  }

  async function connect(baudRate = 115200) {
    if (!isSupported) {
      errorMsg.value = 'Web Serial API not supported in this browser'
      status.value = 'error'
      return
    }
    if (status.value === 'connected' || status.value === 'connecting') return

    try {
      status.value = 'connecting'
      errorMsg.value = ''
      port = await navigator.serial.requestPort()
      await port.open({ baudRate })

      abortCtrl = new AbortController()
      status.value = 'connected'
      acqStore.setDataSource('webserial')
      acqStore.start()

      readLoopActive = true
      if (!port.readable) throw new Error('Serial port readable stream unavailable')
      const r = port.readable.getReader()
      reader = r
      try {
        while (readLoopActive) {
          const { value, done } = await r.read()
          if (done) break
          if (value) onChunk(value)
        }
      } catch (err) {
        if ((err as Error).name !== 'AbortError') {
          errorMsg.value = String(err)
          status.value = 'error'
        }
      } finally {
        r.releaseLock()
        reader = null
      }
    } catch (err) {
      errorMsg.value = (err as Error).message ?? String(err)
      status.value = status.value === 'connecting' ? 'disconnected' : 'error'
    }
  }

  async function disconnect() {
    readLoopActive = false
    abortCtrl?.abort()
    try {
      await (reader as ReadableStreamDefaultReader<Uint8Array> | null)?.cancel()
    } catch {
      /* ignored */
    }
    try {
      await port?.close()
    } catch {
      /* ignored */
    }
    port = null
    reader = null
    abortCtrl = null
    status.value = 'disconnected'
    acqStore.stop()
    acqStore.setDataSource('simulated')
  }

  return {
    isSupported,
    status: readonly(status),
    errorMsg: readonly(errorMsg),
    bytesReceived: readonly(bytesReceived),
    framesReceived: readonly(framesReceived),
    connect,
    disconnect,
    BAUD_RATES,
  }
}
