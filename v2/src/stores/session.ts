import { defineStore } from 'pinia'
import { ref } from 'vue'
import { CHANNEL_DEFS } from '@/config/channels'

export interface SessionMeta {
  id: string
  startTime: number
  endTime: number
  durationSec: number
  sampleCount: number
  sampleRate: number
  source: 'simulated' | 'csv' | 'wav'
  channelIds: string[]
  label?: string
}

export const useSessionStore = defineStore('session', () => {
  const sessions = ref<SessionMeta[]>(
    (() => { try { return JSON.parse(localStorage.getItem('daq-sessions') || '[]') } catch { return [] } })()
  )
  const activeSessionId = ref<string | null>(null)
  const activeSessionStart = ref<number | null>(null)

  function save() {
    localStorage.setItem('daq-sessions', JSON.stringify(sessions.value.slice(-500)))
  }

  function addSession(meta: SessionMeta) {
    sessions.value.push(meta)
    save()
  }

  function deleteSession(id: string) {
    sessions.value = sessions.value.filter(s => s.id !== id)
    save()
  }

  function clearAll() {
    sessions.value = []
    save()
  }

  /** Mark the start of a recording. */
  function beginSession() {
    const id = `s${Date.now()}`
    activeSessionId.value = id
    activeSessionStart.value = Date.now()
  }

  /**
   * Finalise the active session and persist it. No-op if no session is active
   * or duration is too short (< 3 s).
   */
  function endSession(opts: { source: SessionMeta['source']; sampleRate: number }) {
    const start = activeSessionStart.value
    const id = activeSessionId.value
    if (!start || !id) return

    const endTime = Date.now()
    const durationSec = (endTime - start) / 1000
    activeSessionId.value = null
    activeSessionStart.value = null
    if (durationSec < 3) return

    const sampleCount = Math.round(durationSec * opts.sampleRate)
    addSession({
      id,
      startTime: start,
      endTime,
      durationSec: Math.round(durationSec),
      sampleCount,
      sampleRate: opts.sampleRate,
      source: opts.source,
      channelIds: CHANNEL_DEFS.map(c => c.id),
      label: new Date(start).toLocaleString('zh-CN', { hour12: false }),
    })
  }

  function renameSession(id: string, label: string) {
    const s = sessions.value.find(x => x.id === id)
    if (s) { s.label = label; save() }
  }

  return {
    sessions, activeSessionId,
    addSession, deleteSession, clearAll,
    beginSession, endSession, renameSession,
  }
})
