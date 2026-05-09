<template>
  <div class="alarms-view">
    <!-- Left: rules -->
    <aside class="sidebar">
      <div class="sidebar-header">
        <span class="section-title">{{ $t('alarms.rules') }}</span>
        <button class="primary" style="font-size:11px;padding:3px 8px" @click="showAddRule = true">+ {{ $t('alarms.addRule') }}</button>
      </div>
      <div class="rules-list">
        <div v-for="rule in alarmsStore.rules" :key="rule.id" class="rule-item">
          <div class="rule-row">
            <input type="checkbox" :checked="rule.enabled" @change="alarmsStore.toggleRule(rule.id)" />
            <span class="rule-label">{{ rule.label }}</span>
            <span class="badge" :class="`badge-${rule.severity}`">{{ $t(`alarms.severity.${rule.severity}`) }}</span>
          </div>
          <div class="rule-detail mono text-dim">
            {{ rule.channelId }} · {{ $t(`alarms.metrics.${rule.metric}`) }} {{ rule.operator }} {{ rule.threshold }}
          </div>
          <div class="rule-actions">
            <button @click="editRule(rule)" style="font-size:10px;padding:2px 6px">{{ $t('alarms.editRule') }}</button>
            <button class="danger" @click="alarmsStore.deleteRule(rule.id)" style="font-size:10px;padding:2px 6px">×</button>
          </div>
        </div>
      </div>
    </aside>

    <!-- Right: event log -->
    <main class="center">
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
              <th></th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="!alarmsStore.events.length">
              <td colspan="7" class="text-dim" style="text-align:center;padding:20px">{{ $t('alarms.noAlarms') }}</td>
            </tr>
            <tr
              v-for="ev in sortedEvents"
              :key="ev.id"
              :class="`sev-row-${ev.status}`"
            >
              <td><span class="badge" :class="`badge-${ev.severity}`">{{ $t(`alarms.severity.${ev.severity}`) }}</span></td>
              <td class="mono text-dim" style="font-size:10px">{{ formatTime(ev.timestamp) }}</td>
              <td class="mono text-1">{{ ev.channelId }}</td>
              <td>{{ ev.description }}</td>
              <td class="mono">{{ ev.value.toFixed(2) }}</td>
              <td><span class="status-badge" :class="ev.status">{{ $t(`alarms.status.${ev.status}`) }}</span></td>
              <td>
                <button v-if="ev.status === 'active'" @click="alarmsStore.acknowledge(ev.id)" style="font-size:10px;padding:2px 6px">
                  {{ $t('alarms.acknowledge') }}
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </main>

    <!-- Add/edit rule modal -->
    <div v-if="showAddRule" class="modal-overlay" @click.self="showAddRule = false">
      <div class="modal">
        <div class="modal-title">{{ editingRule ? $t('alarms.editRule') : $t('alarms.addRule') }}</div>
        <div class="form-row">
          <label>{{ $t('alarms.channel') }}</label>
          <select v-model="ruleForm.channelId">
            <option v-for="ch in CHANNEL_DEFS" :key="ch.id" :value="ch.id">{{ ch.id }}</option>
          </select>
        </div>
        <div class="form-row">
          <label>{{ $t('alarms.metric') }}</label>
          <select v-model="ruleForm.metric">
            <option value="value">{{ $t('alarms.metrics.value') }}</option>
            <option value="rms">{{ $t('alarms.metrics.rms') }}</option>
            <option value="peak">{{ $t('alarms.metrics.peak') }}</option>
          </select>
        </div>
        <div class="form-row">
          <label>{{ $t('alarms.operator') }}</label>
          <select v-model="ruleForm.operator"><option>></option><option>>=</option><option>&lt;</option><option>&lt;=</option></select>
          <input v-model.number="ruleForm.threshold" type="number" style="width:80px" />
        </div>
        <div class="form-row">
          <label>{{ $t('alarms.severity.high') }}</label>
          <select v-model="ruleForm.severity">
            <option v-for="s in ['high','warn','low','info']" :key="s" :value="s">{{ $t(`alarms.severity.${s}`) }}</option>
          </select>
        </div>
        <div class="form-row">
          <label>{{ $t('alarms.description') }}</label>
          <input v-model="ruleForm.label" type="text" />
        </div>
        <div class="modal-actions">
          <button @click="showAddRule = false">{{ $t('common.cancel') }}</button>
          <button class="primary" @click="saveRule">{{ $t('common.confirm') }}</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, reactive } from 'vue'
import { useAlarmsStore } from '@/stores/alarms'
import { CHANNEL_DEFS } from '@/config/channels'
import type { AlarmRule } from '@/types/alarm'

const alarmsStore = useAlarmsStore()
const showAddRule = ref(false)
const editingRule = ref<AlarmRule | null>(null)

const ruleForm = reactive({
  channelId: 'CH01', metric: 'value', operator: '>', threshold: 0, severity: 'warn', label: '', enabled: true
})

const sortedEvents = computed(() => [...alarmsStore.events].reverse())

function formatTime(ts: number) {
  return new Date(ts).toLocaleTimeString('zh-CN', { hour12: false })
}

function editRule(rule: AlarmRule) {
  editingRule.value = rule
  Object.assign(ruleForm, rule)
  showAddRule.value = true
}

function saveRule() {
  if (editingRule.value) {
    alarmsStore.updateRule(editingRule.value.id, ruleForm as any)
  } else {
    alarmsStore.addRule(ruleForm as any)
  }
  editingRule.value = null
  showAddRule.value = false
}
</script>

<style scoped>
.alarms-view { display: grid; grid-template-columns: 280px 1fr; height: 100%; overflow: hidden; }
.sidebar { border-right: 1px solid var(--border); display: flex; flex-direction: column; overflow-y: auto; }
.sidebar-header { display: flex; align-items: center; justify-content: space-between; padding: 8px; }
.section-title { font-size: 10px; color: var(--text-2); letter-spacing: 0.1em; text-transform: uppercase; }
.rules-list { flex: 1; padding: 0 8px 8px; display: flex; flex-direction: column; gap: 6px; }
.rule-item { background: var(--bg-2); border: 1px solid var(--border); border-radius: var(--r); padding: 8px; }
.rule-row { display: flex; align-items: center; gap: 6px; margin-bottom: 3px; }
.rule-label { flex: 1; font-size: 12px; }
.rule-detail { font-size: 10px; margin-bottom: 4px; }
.rule-actions { display: flex; gap: 4px; }

.center { display: flex; flex-direction: column; overflow: hidden; }
.toolbar { display: flex; align-items: center; gap: 8px; padding: 8px 12px; border-bottom: 1px solid var(--border); }
.spacer { flex: 1; }
.event-table-wrap { flex: 1; overflow-y: auto; }
.event-table { width: 100%; border-collapse: collapse; font-size: 12px; }
th { text-align: left; padding: 6px 12px; font-size: 10px; color: var(--text-2); font-weight: 500; border-bottom: 1px solid var(--border); position: sticky; top: 0; background: var(--bg-1); }
td { padding: 6px 12px; border-bottom: 1px solid var(--border); }
.sev-row-active td { background: rgba(255,51,85,0.03); }
.sev-row-acknowledged td { background: rgba(255,170,0,0.03); }
.status-badge { font-size: 10px; padding: 1px 6px; border-radius: 10px; border: 1px solid var(--border); color: var(--text-2); }
.status-badge.active { color: var(--red); border-color: rgba(255,51,85,0.4); }
.status-badge.acknowledged { color: var(--amber); border-color: rgba(255,170,0,0.4); }
.status-badge.resolved { color: var(--green); border-color: rgba(0,255,149,0.3); }

.modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.6); display: flex; align-items: center; justify-content: center; z-index: 100; }
.modal { background: var(--bg-3); border: 1px solid var(--border-2); border-radius: var(--r2); padding: 20px; min-width: 320px; }
.modal-title { font-size: 14px; font-weight: 600; margin-bottom: 16px; color: var(--text-0); }
.form-row { display: flex; align-items: center; gap: 8px; margin-bottom: 10px; }
.form-row label { width: 80px; font-size: 12px; color: var(--text-2); }
.form-row select, .form-row input { flex: 1; }
.modal-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 16px; }
</style>
