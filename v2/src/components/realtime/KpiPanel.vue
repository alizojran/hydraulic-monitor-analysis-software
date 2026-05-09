<template>
  <div class="kpi-panel">
    <div class="panel-title">└ {{ $t('realtime.kpi') }}</div>
    <div class="kpi-grid">
      <div v-for="kpi in kpis" :key="kpi.id" class="kpi-item">
        <div class="kpi-label">{{ kpi.label }}</div>
        <div class="kpi-val mono" :style="{ color: kpi.color }">
          {{ kpi.value }}<small>{{ kpi.unit }}</small>
        </div>
      </div>
    </div>

    <div class="panel-title">└ {{ $t('realtime.alarmFeed') }} <span class="title-count" v-if="recentAlarms.length">· {{ alarmsStore.activeEvents.length }}</span></div>
    <div class="alarm-feed">
      <div v-if="!recentAlarms.length" class="no-alarms text-dim">{{ $t('alarms.noAlarms') }}</div>
      <div v-for="ev in recentAlarms" :key="ev.id" class="alarm-item" :class="`sev-${ev.severity}`">
        <span class="alarm-time mono">{{ formatTime(ev.timestamp) }}</span>
        <span class="badge" :class="`badge-${ev.severity}`">{{ $t(`alarms.severity.${ev.severity}`).toUpperCase() }}</span>
        <span class="alarm-ch mono">{{ ev.channelId }}</span>
        <span class="alarm-desc">{{ ev.description }}</span>
      </div>
    </div>

    <div class="panel-title">└ {{ $t('realtime.storage') }}</div>
    <div class="storage">
      <div class="stor-row">
        <span class="text-dim">{{ $t('storage.local') }}</span>
        <span class="mono">{{ storage.usedGb }} <span class="text-dim">/ {{ storage.totalGb }} GB</span></span>
      </div>
      <div class="stor-bar"><div class="stor-fill" :style="{ width: storage.pct + '%' }" /></div>
      <div class="stor-row">
        <span class="text-dim">{{ $t('storage.writeRate') }}</span>
        <span class="mono text-cyan">{{ writeRate }} <small>MB/s</small></span>
      </div>
      <div class="stor-row">
        <span class="text-dim">{{ $t('storage.duration') }}</span>
        <span class="mono">{{ acqStore.timeWindowSec >= 3600 ? Math.round(acqStore.timeWindowSec/3600) + ' h' : Math.round(acqStore.timeWindowSec/60) + ' min' }}</span>
      </div>
      <div class="stor-row">
        <span class="text-dim">{{ $t('storage.format') }}</span>
        <span class="mono text-1">CSV / WAV</span>
      </div>
    </div>

    <div class="panel-title">└ {{ $t('realtime.eventLog') }}</div>
    <div class="event-log">
      <div v-for="(ev, i) in eventLog" :key="i" class="event-row mono">
        <span class="ev-time">{{ ev.t }}</span>
        <span class="ev-tag" :style="{color: ev.color}">[{{ ev.tag }}]</span>
        <span class="ev-msg">{{ ev.msg }}</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, onMounted, onUnmounted } from 'vue'
import { useAcquisitionStore } from '@/stores/acquisition'
import { useAlarmsStore } from '@/stores/alarms'
import { useUiStore } from '@/stores/ui'
import { CHANNEL_MAP } from '@/config/channels'
import { useI18n } from 'vue-i18n'

const { locale } = useI18n()
const acqStore = useAcquisitionStore()
const alarmsStore = useAlarmsStore()
const uiStore = useUiStore()

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

const recentAlarms = computed(() => alarmsStore.activeEvents.slice(-6).reverse())

function formatTime(ts: number) {
  const d = new Date(ts)
  return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}:${String(d.getSeconds()).padStart(2,'0')}`
}

const storage = computed(() => {
  // simulated SSD usage that grows slowly with elapsed time
  const usedGb = 342 + Math.min(50, acqStore.elapsedSec / 60)
  const totalGb = 1024
  return {
    usedGb: usedGb.toFixed(1),
    totalGb,
    pct: Math.min(100, (usedGb / totalGb) * 100),
  }
})

const writeRate = computed(() => (acqStore.isRunning && !acqStore.isPaused ? (4.6 + Math.sin(acqStore.elapsedSec * 0.4) * 0.4).toFixed(1) : '0.0'))

interface EventEntry { t: string; tag: string; msg: string; color: string }
const eventLog = ref<EventEntry[]>([])
let logTimer: ReturnType<typeof setInterval> | null = null

const TAG_COLORS: Record<string, string> = {
  SYS: '#00d9ff', TEMP: '#ffaa00', VIB: '#ff3355', SPL: '#ffe600',
  TRIG: '#b366ff', CH02: '#00ff95', CH05: '#ffaa00', V01: '#00d9ff', S01: '#ffe600',
}

function makeEntry(): EventEntry {
  const now = new Date()
  const t = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}:${String(now.getSeconds()).padStart(2,'0')}`
  const samples = locale.value === 'zh' ? [
    { tag: 'SYS', msg: '心跳同步 · 13ch ok' },
    { tag: 'TRIG', msg: '边沿触发就绪' },
    { tag: 'V01', msg: 'RMS 接近警戒值' },
    { tag: 'TEMP', msg: 'CH06 趋势上升 +0.6°C/min' },
    { tag: 'S01', msg: '削波 · 95.4 dB · 抑制' },
    { tag: 'CH02', msg: '在量程内 · 165.2 bar' },
    { tag: 'SYS', msg: 'GC 完成 · 38ms' },
  ] : [
    { tag: 'SYS', msg: 'Heartbeat sync · 13ch ok' },
    { tag: 'TRIG', msg: 'Edge trigger armed' },
    { tag: 'V01', msg: 'RMS near warning' },
    { tag: 'TEMP', msg: 'CH06 trend +0.6°C/min' },
    { tag: 'S01', msg: 'Clip · 95.4 dB · attenuated' },
    { tag: 'CH02', msg: 'In range · 165.2 bar' },
    { tag: 'SYS', msg: 'GC complete · 38ms' },
  ]
  const pick = samples[Math.floor(Math.random() * samples.length)]
  return { t, tag: pick.tag, msg: pick.msg, color: TAG_COLORS[pick.tag] ?? '#5a7898' }
}

onMounted(() => {
  for (let i = 0; i < 8; i++) eventLog.value.unshift(makeEntry())
  logTimer = setInterval(() => {
    if (!acqStore.isRunning || acqStore.isPaused) return
    eventLog.value.unshift(makeEntry())
    if (eventLog.value.length > 40) eventLog.value.length = 40
  }, 2200)
})
onUnmounted(() => { if (logTimer) clearInterval(logTimer) })
</script>

<style scoped>
.kpi-panel {
  display: flex; flex-direction: column; height: 100%;
  overflow-y: auto; padding: 8px; gap: 4px;
}
.panel-title {
  font-size: 10px; color: var(--cyan); letter-spacing: 0.12em;
  padding: 8px 0 4px; text-transform: uppercase; font-family: var(--font-mono);
  border-bottom: 1px dashed var(--border);
}
.title-count { color: var(--amber); margin-left: 4px; }

.kpi-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 4px; margin-bottom: 4px; }
.kpi-item {
  background: var(--bg-2); border: 1px solid var(--border); border-radius: var(--r);
  padding: 6px 8px;
}
.kpi-label { font-size: 10px; color: var(--text-2); margin-bottom: 2px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.kpi-val { font-size: 17px; font-weight: 700; letter-spacing: 0.02em; }
.kpi-val small { font-size: 9.5px; font-weight: 400; color: var(--text-2); margin-left: 3px; }

.alarm-feed { display: flex; flex-direction: column; gap: 3px; }
.no-alarms { font-size: 10.5px; padding: 8px 0; text-align: center; }
.alarm-item {
  display: grid;
  grid-template-columns: auto auto auto 1fr;
  align-items: center; gap: 6px;
  padding: 4px 6px; border-radius: var(--r);
  background: var(--bg-2); border: 1px solid var(--border); font-size: 10.5px;
}
.alarm-item.sev-high { border-color: rgba(255,51,85,0.5); background: rgba(255,51,85,0.06); }
.alarm-item.sev-warn { border-color: rgba(255,170,0,0.5); background: rgba(255,170,0,0.05); }
.alarm-time { font-size: 9.5px; color: var(--text-2); }
.alarm-ch { font-size: 9.5px; color: var(--text-2); min-width: 32px; }
.alarm-desc { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--text-1); }
.badge {
  font-size: 9px; padding: 1px 5px; border-radius: 2px; letter-spacing: 0.06em;
  font-family: var(--font-mono);
}
.badge-high { background: var(--red); color: #fff; }
.badge-warn { background: var(--amber); color: #1a1000; }
.badge-low,.badge-info { background: var(--bg-3); color: var(--text-1); }

.storage { display: flex; flex-direction: column; gap: 3px; padding: 2px 0 4px; }
.stor-row { display: flex; justify-content: space-between; font-size: 10.5px; }
.stor-row .mono { font-size: 11px; color: var(--text-1); }
.stor-row small { font-size: 9px; color: var(--text-2); margin-left: 2px; }
.stor-bar {
  height: 4px; background: var(--bg-2); border: 1px solid var(--border);
  border-radius: 2px; overflow: hidden; margin: 1px 0;
}
.stor-fill { height: 100%; background: linear-gradient(90deg, var(--cyan), var(--green)); }

.event-log {
  font-size: 10.5px; line-height: 1.55;
  padding: 4px 0; flex: 0 1 auto; max-height: 230px; overflow-y: auto;
}
.event-row { display: flex; gap: 5px; }
.ev-time { color: var(--text-dim); }
.ev-tag { font-weight: 600; }
.ev-msg { color: var(--text-1); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
</style>
