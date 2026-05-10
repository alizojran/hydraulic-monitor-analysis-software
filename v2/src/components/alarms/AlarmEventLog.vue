<template>
  <div class="event-log">
    <div class="toolbar">
      <span class="section-title">{{ $t('alarms.title') }}</span>
      <div class="spacer" />
      <button @click="alarmsStore.acknowledgeAll()">{{ $t('alarms.acknowledgeAll') }}</button>
      <button @click="alarmsStore.clearResolved()">{{ $t('alarms.clear') }}</button>
    </div>
    <div class="event-table-wrap">
      <table class="event-table">
        <thead>
          <tr>
            <th>{{ $t('alarms.severity.high') }} / Sev</th>
            <th>{{ $t('alarms.time') }}</th>
            <th>{{ $t('alarms.channel') }}</th>
            <th>{{ $t('alarms.description') }}</th>
            <th>{{ $t('alarms.value') }}</th>
            <th>Status</th>
            <th>{{ $t('diagnosticLog.alarmColumnHeader') }}</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="!alarmsStore.events.length">
            <td colspan="8" class="text-dim" style="text-align: center; padding: 20px">
              {{ $t('alarms.noAlarms') }}
            </td>
          </tr>
          <tr v-for="ev in sortedEvents" :key="ev.id" :class="`sev-row-${ev.status}`">
            <td>
              <span class="badge" :class="`badge-${ev.severity}`">{{
                $t(`alarms.severity.${ev.severity}`)
              }}</span>
            </td>
            <td class="mono text-dim" style="font-size: 10px">{{ formatTime(ev.timestamp) }}</td>
            <td class="mono text-1">{{ ev.channelId }}</td>
            <td>{{ ev.description }}</td>
            <td class="mono">{{ ev.value.toFixed(2) }}</td>
            <td>
              <span class="status-badge" :class="ev.status">{{
                $t(`alarms.status.${ev.status}`)
              }}</span>
            </td>
            <td>
              <template v-if="diagnosticByAlarm[ev.id]">
                <button
                  v-if="diagnosticByAlarm[ev.id].status === 'awaiting_feedback'"
                  class="ai-pending-btn"
                  @click="openFeedback(diagnosticByAlarm[ev.id].id)"
                >
                  {{ $t('diagnosticLog.pendingFeedback') }} ▶
                </button>
                <span
                  v-else-if="
                    diagnosticByAlarm[ev.id].status === 'complete' &&
                    diagnosticByAlarm[ev.id].aiDiagnosis
                  "
                  class="ai-done"
                >
                  {{ diagnosticByAlarm[ev.id].aiDiagnosis?.fault_type }}
                </span>
                <span v-else-if="diagnosticByAlarm[ev.id].status === 'ai_error'" class="ai-error">
                  AI ✗
                </span>
                <span v-else class="ai-pending">⏳</span>
              </template>
            </td>
            <td>
              <button
                v-if="ev.status === 'active'"
                style="font-size: 10px; padding: 2px 6px"
                @click="alarmsStore.acknowledge(ev.id)"
              >
                {{ $t('alarms.acknowledge') }}
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
    <DiagnosticFeedbackModal v-model="showFeedback" :event-id="feedbackEventId" />
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { useAlarmsStore } from '@/stores/alarms'
import { useDiagnosticLogStore } from '@/stores/diagnosticLog'
import DiagnosticFeedbackModal from '@/components/alarms/DiagnosticFeedbackModal.vue'
import type { DiagnosticEvent } from '@/types/diagnostic'

const alarmsStore = useAlarmsStore()
const log = useDiagnosticLogStore()

const sortedEvents = computed(() => [...alarmsStore.events].reverse())

const diagnosticByAlarm = computed<Record<string, DiagnosticEvent>>(() => {
  const map: Record<string, DiagnosticEvent> = {}
  for (const ev of log.events) {
    if (ev.relatedAlarmEventId) map[ev.relatedAlarmEventId] = ev
  }
  return map
})

const showFeedback = ref(false)
const feedbackEventId = ref<string | null>(null)

function openFeedback(eventId: string) {
  feedbackEventId.value = eventId
  showFeedback.value = true
}

function formatTime(ts: number) {
  return new Date(ts).toLocaleTimeString('zh-CN', { hour12: false })
}
</script>

<style scoped>
.event-log {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
}
.toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
}
.section-title {
  font-size: 10px;
  color: var(--text-2);
  letter-spacing: 0.1em;
  text-transform: uppercase;
}
.spacer {
  flex: 1;
}
.event-table-wrap {
  flex: 1;
  overflow-y: auto;
}
.event-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;
}
th {
  text-align: left;
  padding: 6px 12px;
  font-size: 10px;
  color: var(--text-2);
  font-weight: 500;
  border-bottom: 1px solid var(--border);
  position: sticky;
  top: 0;
  background: var(--bg-1);
}
td {
  padding: 6px 12px;
  border-bottom: 1px solid var(--border);
}
.sev-row-active td {
  background: rgba(255, 51, 85, 0.03);
}
.sev-row-acknowledged td {
  background: rgba(255, 170, 0, 0.03);
}
.status-badge {
  font-size: 10px;
  padding: 1px 6px;
  border-radius: 10px;
  border: 1px solid var(--border);
  color: var(--text-2);
}
.status-badge.active {
  color: var(--red);
  border-color: rgba(255, 51, 85, 0.4);
}
.status-badge.acknowledged {
  color: var(--amber);
  border-color: rgba(255, 170, 0, 0.4);
}
.status-badge.resolved {
  color: var(--green);
  border-color: rgba(0, 255, 149, 0.3);
}
.ai-pending-btn {
  font-size: 10px;
  padding: 2px 8px;
  background: rgba(255, 170, 0, 0.1);
  border: 1px solid rgba(255, 170, 0, 0.4);
  color: var(--amber);
  border-radius: 2px;
  cursor: pointer;
}
.ai-pending-btn:hover {
  background: rgba(255, 170, 0, 0.18);
}
.ai-done {
  font-size: 10px;
  font-family: var(--font-mono);
  color: var(--cyan);
  padding: 1px 6px;
  border: 1px solid rgba(0, 217, 255, 0.3);
  border-radius: 2px;
}
.ai-error {
  font-size: 10px;
  color: var(--red);
}
.ai-pending {
  font-size: 12px;
  color: var(--text-2);
}
</style>
