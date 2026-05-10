import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { DEFAULT_ALARM_RULES } from '@/config/defaults'
import type { AlarmRule, AlarmEvent, AlarmSeverity } from '@/types/alarm'
import type { SampleFrame } from '@/types/channel'

const SEV_ORDER: Record<AlarmSeverity, number> = { high: 4, warn: 3, low: 2, info: 1 }

function loadFromStorage<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(key)
    return v ? JSON.parse(v) : fallback
  } catch {
    return fallback
  }
}

export const useAlarmsStore = defineStore('alarms', () => {
  const rules = ref<AlarmRule[]>(loadFromStorage('daq-alarm-rules', DEFAULT_ALARM_RULES))
  const events = ref<AlarmEvent[]>(loadFromStorage('daq-alarm-events', []))
  const activeRuleState = ref<Record<string, boolean>>({}) // ruleId -> currently triggered

  const activeEvents = computed(() => events.value.filter((e) => e.status === 'active'))
  const activeSeverity = computed<AlarmSeverity | null>(() => {
    if (activeEvents.value.length === 0) return null
    return activeEvents.value.reduce<AlarmSeverity>(
      (max, e) => (SEV_ORDER[e.severity] > SEV_ORDER[max] ? e.severity : max),
      'info',
    )
  })

  function saveRules() {
    localStorage.setItem('daq-alarm-rules', JSON.stringify(rules.value))
  }
  function saveEvents() {
    localStorage.setItem('daq-alarm-events', JSON.stringify(events.value.slice(-1000)))
  }

  function addRule(rule: Omit<AlarmRule, 'id'>) {
    rules.value.push({ ...rule, id: `r${Date.now()}` })
    saveRules()
  }
  function updateRule(id: string, patch: Partial<AlarmRule>) {
    const idx = rules.value.findIndex((r) => r.id === id)
    if (idx >= 0) {
      rules.value[idx] = { ...rules.value[idx], ...patch }
      saveRules()
    }
  }
  function deleteRule(id: string) {
    rules.value = rules.value.filter((r) => r.id !== id)
    saveRules()
  }
  function toggleRule(id: string) {
    updateRule(id, { enabled: !rules.value.find((r) => r.id === id)?.enabled })
  }

  function acknowledge(id: string) {
    const e = events.value.find((ev) => ev.id === id)
    if (e) {
      e.status = 'acknowledged'
      saveEvents()
    }
  }
  function acknowledgeAll() {
    events.value.forEach((e) => {
      if (e.status === 'active') e.status = 'acknowledged'
    })
    saveEvents()
  }
  function clearResolved() {
    events.value = events.value.filter((e) => e.status !== 'resolved')
    saveEvents()
  }

  function setRules(newRules: AlarmRule[]) {
    rules.value = newRules
    saveRules()
  }

  function evaluateFrame(
    frame: SampleFrame,
    channelRms: Record<string, number>,
    channelPeak: Record<string, number>,
  ) {
    const ts = frame.timestamp
    for (const rule of rules.value) {
      if (!rule.enabled) continue
      const val =
        rule.metric === 'value'
          ? (frame.channels.get(rule.channelId) ?? 0)
          : rule.metric === 'rms'
            ? (channelRms[rule.channelId] ?? 0)
            : (channelPeak[rule.channelId] ?? 0)

      const triggered =
        rule.operator === '>'
          ? val > rule.threshold
          : rule.operator === '<'
            ? val < rule.threshold
            : rule.operator === '>='
              ? val >= rule.threshold
              : val <= rule.threshold

      const wasTriggered = activeRuleState.value[rule.id] ?? false

      if (triggered && !wasTriggered) {
        // rising edge: create new alarm event
        const event: AlarmEvent = {
          id: `e${Date.now()}-${Math.random().toString(36).slice(2)}`,
          ruleId: rule.id,
          channelId: rule.channelId,
          timestamp: ts,
          value: val,
          severity: rule.severity,
          description: rule.label,
          status: 'active',
        }
        events.value.push(event)
        if (events.value.length > 2000) events.value.shift()
        saveEvents()
      } else if (!triggered && wasTriggered) {
        // falling edge: resolve
        const activeEv = [...events.value]
          .reverse()
          .find((e) => e.ruleId === rule.id && e.status !== 'resolved')
        if (activeEv) {
          activeEv.status = 'resolved'
          saveEvents()
        }
      }
      activeRuleState.value[rule.id] = triggered
    }
  }

  return {
    rules,
    events,
    activeEvents,
    activeSeverity,
    addRule,
    updateRule,
    deleteRule,
    toggleRule,
    setRules,
    acknowledge,
    acknowledgeAll,
    clearResolved,
    evaluateFrame,
  }
})
