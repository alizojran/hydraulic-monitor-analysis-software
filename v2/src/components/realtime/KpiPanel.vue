<template>
  <div class="kpi-panel">
    <div class="panel-title text-dim">{{ $t('realtime.kpi') }}</div>
    <div class="kpi-grid">
      <div v-for="kpi in kpis" :key="kpi.id" class="kpi-item">
        <div class="kpi-label">{{ kpi.label }}</div>
        <div class="kpi-val mono" :style="{ color: kpi.color }">{{ kpi.value }}<small>{{ kpi.unit }}</small></div>
      </div>
    </div>

    <div class="panel-title text-dim" style="margin-top:12px">{{ $t('realtime.alarmFeed') }}</div>
    <div class="alarm-feed">
      <div v-if="!alarmsStore.activeEvents.length" class="no-alarms text-dim">{{ $t('alarms.noAlarms') }}</div>
      <div v-for="ev in recentAlarms" :key="ev.id" class="alarm-item" :class="`sev-${ev.severity}`">
        <span class="badge" :class="`badge-${ev.severity}`">{{ $t(`alarms.severity.${ev.severity}`) }}</span>
        <span class="alarm-ch mono">{{ ev.channelId }}</span>
        <span class="alarm-desc">{{ ev.description }}</span>
        <span class="alarm-val mono">{{ ev.value.toFixed(1) }}</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useAcquisitionStore } from '@/stores/acquisition'
import { useAlarmsStore } from '@/stores/alarms'
import { CHANNEL_MAP } from '@/config/channels'
import { useI18n } from 'vue-i18n'

const { t, locale } = useI18n()
const acqStore = useAcquisitionStore()
const alarmsStore = useAlarmsStore()

const kpiDefs = [
  { id: 'CH01', color: '#00ff95', unit: 'bar' },
  { id: 'CH02', color: '#00ff95', unit: 'bar' },
  { id: 'CH05', color: '#ffaa00', unit: '°C' },
  { id: 'CH06', color: '#ffaa00', unit: '°C' },
  { id: 'F01',  color: '#00d9ff', unit: 'L/m' },
  { id: 'V01',  color: '#00d9ff', unit: 'rpm' },
]

const kpis = computed(() => kpiDefs.map(def => ({
  ...def,
  label: locale.value === 'zh' ? (CHANNEL_MAP.get(def.id)?.nameZh ?? def.id) : (CHANNEL_MAP.get(def.id)?.nameEn ?? def.id),
  value: (acqStore.channelValues[def.id] ?? 0).toFixed(def.unit === 'rpm' ? 0 : 1),
})))

const recentAlarms = computed(() => alarmsStore.activeEvents.slice(-8).reverse())
</script>

<style scoped>
.kpi-panel { display: flex; flex-direction: column; height: 100%; overflow-y: auto; padding: 8px; }
.panel-title { font-size: 10px; letter-spacing: 0.08em; padding: 4px 0; text-transform: uppercase; }
.kpi-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 4px; }
.kpi-item {
  background: var(--bg-2); border: 1px solid var(--border); border-radius: var(--r);
  padding: 6px 8px;
}
.kpi-label { font-size: 10px; color: var(--text-2); margin-bottom: 2px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.kpi-val { font-size: 16px; font-weight: 700; }
.kpi-val small { font-size: 10px; font-weight: 400; color: var(--text-2); margin-left: 2px; }

.alarm-feed { display: flex; flex-direction: column; gap: 3px; }
.no-alarms { font-size: 11px; padding: 8px 0; text-align: center; }
.alarm-item {
  display: flex; align-items: center; gap: 6px;
  padding: 4px 6px; border-radius: var(--r);
  background: var(--bg-2); border: 1px solid var(--border); font-size: 11px;
}
.alarm-ch { font-size: 10px; color: var(--text-2); min-width: 36px; }
.alarm-desc { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--text-1); }
.alarm-val { font-size: 10px; color: var(--text-2); }
</style>
