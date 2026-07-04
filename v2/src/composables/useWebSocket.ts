/**
 * useWebSocket — WebSocket data source.
 *
 * Accepts two message formats from the server:
 *
 *   1. Frame  {"type":"frame","ts":1234567890,"ch":{"CH01":287.4,...}}
 *   2. Batch  {"type":"batch","frames":[...]}   (array of frame objects)
 *
 * The server should send at ~10 Hz for smooth visuals; higher rates are
 * fine — every frame is pushed into the acquisition ring buffer.
 */
import { ref, readonly } from 'vue'
import { useAcquisitionStore } from '@/stores/acquisition'
import type { SampleFrame } from '@/types/channel'
import { CHANNEL_DEFS } from '@/config/channels'

export type WsStatus = 'disconnected' | 'connecting' | 'connected' | 'reconnecting' | 'error'

const MAX_RECONNECT_TRIES = 5
const RECONNECT_BASE_MS = 1000

export function useWebSocket() {
  const acqStore = useAcquisitionStore()

  const status = ref<WsStatus>('disconnected')
  const errorMsg = ref('')
  const url = ref('')
  const messagesReceived = ref(0)
  const framesReceived = ref(0)

  let ws: WebSocket | null = null
  let reconnectTries = 0
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null
  let intentionalClose = false

  function parseFrameObj(obj: { ts?: unknown; ch?: unknown }): SampleFrame | null {
    if (typeof obj.ts !== 'number' || typeof obj.ch !== 'object' || obj.ch === null) return null
    const channels = new Map<string, number>()
    const chObj = obj.ch as Record<string, unknown>
    for (const def of CHANNEL_DEFS) {
      const v = chObj[def.id]
      if (typeof v === 'number') channels.set(def.id, v)
    }
    return channels.size > 0 ? { timestamp: obj.ts, channels } : null
  }

  function handleMessage(data: string) {
    messagesReceived.value++
    try {
      const msg = JSON.parse(data) as {
        type?: string
        ts?: number
        ch?: Record<string, number>
        frames?: unknown[]
      }
      if (msg.type === 'batch' && Array.isArray(msg.frames)) {
        for (const f of msg.frames) {
          const frame = parseFrameObj(f as { ts?: unknown; ch?: unknown })
          if (frame) {
            acqStore.pushFrame(frame)
            framesReceived.value++
          }
        }
      } else {
        const frame = parseFrameObj(msg)
        if (frame) {
          acqStore.pushFrame(frame)
          framesReceived.value++
        }
      }
    } catch {
      /* malformed message — skip */
    }
  }

  function scheduleReconnect() {
    if (intentionalClose || reconnectTries >= MAX_RECONNECT_TRIES) {
      status.value = reconnectTries >= MAX_RECONNECT_TRIES ? 'error' : 'disconnected'
      if (reconnectTries >= MAX_RECONNECT_TRIES) {
        errorMsg.value = `Connection lost after ${MAX_RECONNECT_TRIES} retries`
      }
      return
    }
    status.value = 'reconnecting'
    const delay = RECONNECT_BASE_MS * 2 ** reconnectTries
    reconnectTries++
    reconnectTimer = setTimeout(() => openSocket(url.value), delay)
  }

  function openSocket(wsUrl: string) {
    ws = new WebSocket(wsUrl)

    ws.onopen = () => {
      reconnectTries = 0
      status.value = 'connected'
      errorMsg.value = ''
      acqStore.setDataSource('websocket')
      acqStore.start()
    }

    ws.onmessage = (evt) => handleMessage(evt.data as string)

    ws.onerror = () => {
      errorMsg.value = 'WebSocket error'
    }

    ws.onclose = () => {
      ws = null
      acqStore.stop()
      if (!intentionalClose) scheduleReconnect()
      else {
        status.value = 'disconnected'
        acqStore.setDataSource('simulated')
      }
    }
  }

  function connect(wsUrl: string) {
    if (status.value === 'connected' || status.value === 'connecting') return
    intentionalClose = false
    reconnectTries = 0
    url.value = wsUrl
    status.value = 'connecting'
    errorMsg.value = ''
    openSocket(wsUrl)
  }

  function disconnect() {
    intentionalClose = true
    if (reconnectTimer) {
      clearTimeout(reconnectTimer)
      reconnectTimer = null
    }
    ws?.close()
    ws = null
    status.value = 'disconnected'
    acqStore.stop()
    acqStore.setDataSource('simulated')
  }

  return {
    status: readonly(status),
    errorMsg: readonly(errorMsg),
    url: readonly(url),
    messagesReceived: readonly(messagesReceived),
    framesReceived: readonly(framesReceived),
    connect,
    disconnect,
  }
}
