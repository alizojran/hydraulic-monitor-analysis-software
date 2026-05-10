<template>
  <aside class="sidebar">
    <div class="sidebar-header">
      <span class="section-title">{{ $t('alarms.rules') }}</span>
      <button class="primary" style="font-size: 11px; padding: 3px 8px" @click="openAdd">
        + {{ $t('alarms.addRule') }}
      </button>
    </div>
    <div class="rules-list">
      <div v-for="rule in alarmsStore.rules" :key="rule.id" class="rule-item">
        <div class="rule-row">
          <input
            type="checkbox"
            :checked="rule.enabled"
            @change="alarmsStore.toggleRule(rule.id)"
          />
          <span class="rule-label">{{ rule.label }}</span>
          <span class="badge" :class="`badge-${rule.severity}`">{{
            $t(`alarms.severity.${rule.severity}`)
          }}</span>
        </div>
        <div class="rule-detail mono text-dim">
          {{ rule.channelId }} · {{ $t(`alarms.metrics.${rule.metric}`) }} {{ rule.operator }}
          {{ rule.threshold }}
        </div>
        <div class="rule-actions">
          <button style="font-size: 10px; padding: 2px 6px" @click="editRule(rule)">
            {{ $t('alarms.editRule') }}
          </button>
          <button
            class="danger"
            style="font-size: 10px; padding: 2px 6px"
            @click="alarmsStore.deleteRule(rule.id)"
          >
            ×
          </button>
        </div>
      </div>
    </div>

    <!-- Add/edit rule modal -->
    <div v-if="showModal" class="modal-overlay" @click.self="showModal = false">
      <div class="modal">
        <div class="modal-title">
          {{ editingRule ? $t('alarms.editRule') : $t('alarms.addRule') }}
        </div>
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
          <select v-model="ruleForm.operator">
            <option>></option>
            <option>>=</option>
            <option>&lt;</option>
            <option>&lt;=</option>
          </select>
          <input v-model.number="ruleForm.threshold" type="number" style="width: 80px" />
        </div>
        <div class="form-row">
          <label>{{ $t('alarms.severity.high') }}</label>
          <select v-model="ruleForm.severity">
            <option v-for="s in ['high', 'warn', 'low', 'info']" :key="s" :value="s">
              {{ $t(`alarms.severity.${s}`) }}
            </option>
          </select>
        </div>
        <div class="form-row">
          <label>{{ $t('alarms.description') }}</label>
          <input v-model="ruleForm.label" type="text" />
        </div>
        <div class="modal-actions">
          <button @click="showModal = false">{{ $t('common.cancel') }}</button>
          <button class="primary" @click="saveRule">{{ $t('common.confirm') }}</button>
        </div>
      </div>
    </div>
  </aside>
</template>

<script setup lang="ts">
import { ref, reactive } from 'vue'
import { useAlarmsStore } from '@/stores/alarms'
import { CHANNEL_DEFS } from '@/config/channels'
import type { AlarmRule, AlarmMetric, AlarmOperator, AlarmSeverity } from '@/types/alarm'

const alarmsStore = useAlarmsStore()
const showModal = ref(false)
const editingRule = ref<AlarmRule | null>(null)

const ruleForm = reactive<Omit<AlarmRule, 'id'>>({
  channelId: 'CH01',
  metric: 'value' as AlarmMetric,
  operator: '>' as AlarmOperator,
  threshold: 0,
  severity: 'warn' as AlarmSeverity,
  label: '',
  enabled: true,
})

function openAdd() {
  editingRule.value = null
  Object.assign(ruleForm, {
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
  Object.assign(ruleForm, rule)
  showModal.value = true
}

function saveRule() {
  if (editingRule.value) {
    alarmsStore.updateRule(editingRule.value.id, ruleForm)
  } else {
    alarmsStore.addRule(ruleForm)
  }
  editingRule.value = null
  showModal.value = false
}
</script>

<style scoped>
.sidebar {
  border-right: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  overflow-y: auto;
}
.sidebar-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px;
  flex-shrink: 0;
}
.section-title {
  font-size: 10px;
  color: var(--text-2);
  letter-spacing: 0.1em;
  text-transform: uppercase;
}
.rules-list {
  flex: 1;
  padding: 0 8px 8px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.rule-item {
  background: var(--bg-2);
  border: 1px solid var(--border);
  border-radius: var(--r);
  padding: 8px;
}
.rule-row {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 3px;
}
.rule-label {
  flex: 1;
  font-size: 12px;
}
.rule-detail {
  font-size: 10px;
  margin-bottom: 4px;
}
.rule-actions {
  display: flex;
  gap: 4px;
}
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
}
.modal {
  background: var(--bg-3);
  border: 1px solid var(--border-2);
  border-radius: var(--r2);
  padding: 20px;
  min-width: 320px;
}
.modal-title {
  font-size: 14px;
  font-weight: 600;
  margin-bottom: 16px;
  color: var(--text-0);
}
.form-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 10px;
}
.form-row label {
  width: 80px;
  font-size: 12px;
  color: var(--text-2);
}
.form-row select,
.form-row input {
  flex: 1;
}
.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 16px;
}
</style>
