import { defineStore } from 'pinia'
import { ref } from 'vue'

export interface SessionMeta {
  id: string
  startTime: number
  endTime: number
  durationSec: number
  sampleCount: number
  channelIds: string[]
  label?: string
}

export const useSessionStore = defineStore('session', () => {
  const sessions = ref<SessionMeta[]>(
    (() => { try { return JSON.parse(localStorage.getItem('daq-sessions') || '[]') } catch { return [] } })()
  )
  const activeSessionId = ref<string | null>(null)

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

  return { sessions, activeSessionId, addSession, deleteSession }
})
