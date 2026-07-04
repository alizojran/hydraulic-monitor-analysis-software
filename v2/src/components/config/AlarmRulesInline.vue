<template>
  <div class="alarm-rules">
    <div class="rules-toolbar">
      <button class="primary" @click="openAdd">+ {{ $t('alarms.addRule') }}</button>
    </div>

    <div class="rules-list">
      <div v-for="rule in alarmsStore.rules" :key="rule.id" class="rule-card">
        <div class="rule-top">
          <input
            type="checkbox"
            :checked="rule.enabled"
            @change="alarmsStore.toggleRule(rule.id)"
          />
          <span class="rule-label">{{ rule.label }}</span>
          <span class="badge" :class="`badge-${rule.severity}`">{{
            $t(`alarms.severity.${rule.severity}`)
          }}</span>
          <div class="spacer" />
          <button class="action-btn" @click="editRule(rule)">{{ $t('alarms.editRule') }}</button>
          <button class="action-btn danger" @click="alarmsStore.deleteRule(rule.id)">×</button>
        </div>
        <div class="rule-detail mono text-dim">
          {{ rule.channelId }} · {{ $t(`alarms.metrics.${rule.metric}`) }} {{ rule.operator }}
          {{ rule.threshold }}
        </div>
      </div>
      <div v-if="alarmsStore.rules.length === 0" class="no-rules text-dim">
        {{ $t('alarms.noAlarms') }}
      </div>
    </div>

    <!-- Add/edit modal -->
    <div v-if="showModal" class="modal-overlay" @click.self="showModal = false">
      <div class="modal">
        <div class="modal-title">
          {{ editingRule ? $t('alarms.editRule') : $t('alarms.addRule') }}
        </div>
        <div class="form-row">
          <label>{{ $t('alarms.channel') }}</label>
          <select v-model="form.channelId">
            <option v-for="ch in CHANNEL_DEFS" :key="ch.id" :value="ch.id">{{ ch.id }}</option>
          </select>
        </div>
        <div class="form-row">
          <label>{{ $t('alarms.metric') }}</label>
          <select v-model="form.metric">
            <option value="value">{{ $t('alarms.metrics.value') }}</option>
            <option value="rms">{{ $t('alarms.metrics.rms') }}</option>
            <option value="peak">{{ $t('alarms.metrics.peak') }}</option>
          </select>
        </div>
        <div class="form-row">
          <label>{{ $t('alarms.operator') }}</label>
          <div class="inline-row">
            <select v-model="form.operator">
              <option>></option>
              <option>>=</option>
              <option>&lt;</option>
              <option>&lt;=</option>
            </select>
            <input v-model.number="form.threshold" type="number" style="width: 80px" />
          </div>
        </div>
        <div class="form-row">
          <label>{{ $t('alarms.severity.high') }}</label>
          <select v-model="form.severity">
            <option v-for="s in ['high', 'warn', 'low', 'info']" :key="s" :value="s">
              {{ $t(`alarms.severity.${s}`) }}
            </option>
          </select>
        </div>
        <div class="form-row">
          <label>{{ $t('alarms.description') }}</label>
          <input v-model="form.label" type="text" />
        </div>
        <div class="modal-actions">
          <button @click="showModal = false">{{ $t('common.cancel') }}</button>
          <button class="primary" @click="saveRule">{{ $t('common.confirm') }}</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive } from 'vue'
import { useAlarmsStore } from '@/stores/alarms'
import { CHANNEL_DEFS } from '@/config/channels'
import type { AlarmRule, AlarmOperator } from '@/types/alarm'

const alarmsStore = useAlarmsStore()
const showModal = ref(false)
const editingRule = ref<AlarmRule | null>(null)

const form = reactive({
  channelId: 'CH01',
  metric: 'value' as 'value' | 'rms' | 'peak',
  operator: '>' as AlarmOperator,
  threshold: 0,
  severity: 'warn' as 'high' | 'warn' | 'low' | 'info',
  label: '',
  enabled: true,
})

function openAdd() {
  editingRule.value = null
  Object.assign(form, {
    channelId: 'CH01',
    metric: 'value',
    operator: '>',
    threshold: 0,
    severity: 'warn',
    label: '',
    enabled: true,
  })
  showModal.value = true
}

function editRule(rule: AlarmRule) {
  editingRule.value = rule
  Object.assign(form, { ...rule })
  showModal.value = true
}

function saveRule() {
  if (editingRule.value) {
    alarmsStore.updateRule(editingRule.value.id, { ...form })
  } else {
    alarmsStore.addRule({ ...form })
  }
  showModal.value = false
}
</script>

<style scoped>
.alarm-rules {
  display: flex;
  flex-direction: column;
  gap: 10px;
  max-width: 700px;
}
.rules-toolbar {
  display: flex;
  gap: 8px;
}
.rules-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.rule-card {
  background: var(--bg-1);
  border: 1px solid var(--border);
  border-radius: 3px;
  padding: 8px 10px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.rule-top {
  display: flex;
  align-items: center;
  gap: 8px;
}
.rule-label {
  font-size: 12px;
  color: var(--text-1);
  flex: 1;
}
.rule-detail {
  font-size: 10.5px;
  padding-left: 22px;
}
.spacer {
  flex: 1;
}
.action-btn {
  font-size: 10px;
  padding: 2px 8px;
  background: var(--bg-2);
  border: 1px solid var(--border);
  border-radius: 2px;
  color: var(--text-2);
}
.action-btn.danger {
  color: var(--red);
  border-color: rgba(255, 51, 85, 0.3);
}
.no-rules {
  font-size: 12px;
  padding: 12px 0;
}

.badge {
  font-size: 9px;
  padding: 1px 5px;
  border-radius: 2px;
  font-family: var(--font-mono);
  letter-spacing: 0.05em;
  text-transform: uppercase;
}
.badge-high {
  background: rgba(255, 51, 85, 0.12);
  color: var(--red);
  border: 1px solid rgba(255, 51, 85, 0.3);
}
.badge-warn {
  background: rgba(255, 170, 0, 0.1);
  color: var(--amber);
  border: 1px solid rgba(255, 170, 0, 0.3);
}
.badge-low {
  background: rgba(0, 217, 255, 0.08);
  color: var(--cyan);
  border: 1px solid rgba(0, 217, 255, 0.2);
}
.badge-info {
  background: var(--bg-2);
  color: var(--text-2);
  border: 1px solid var(--border);
}

.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 200;
}
.modal {
  background: var(--bg-1);
  border: 1px solid var(--border);
  border-radius: 4px;
  padding: 20px;
  min-width: 340px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.modal-title {
  font-size: 13px;
  color: var(--text-1);
  font-weight: 600;
}
.form-row {
  display: grid;
  grid-template-columns: 90px 1fr;
  align-items: center;
  gap: 10px;
  font-size: 12px;
}
.form-row label {
  color: var(--text-2);
  font-size: 11px;
}
.form-row input[type='text'],
.form-row input[type='number'],
.form-row select {
  font-size: 12px;
  padding: 3px 6px;
  width: 100%;
}
.inline-row {
  display: flex;
  gap: 6px;
  align-items: center;
}
.inline-row select {
  width: auto;
}
.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
.primary {
  background: rgba(0, 217, 255, 0.12);
  border: 1px solid var(--cyan);
  color: var(--cyan);
  padding: 4px 14px;
  border-radius: 2px;
  font-size: 12px;
}
.mono {
  font-family: var(--font-mono);
}
.text-dim {
  color: var(--text-2);
}
</style>
