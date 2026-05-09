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

      <!-- Stats panel -->
      <div class="stats-panel">
        <div class="stats-card">
          <div class="sc-head">
            <span class="sc-title">{{ locale === 'zh' ? '近 24 小时事件' : 'Last 24 h Events' }}</span>
            <span class="sc-total mono">{{ stats24h.total }}</span>
          </div>
          <canvas ref="histCanvas" class="hist-canvas" width="600" height="80" />
          <div class="hist-axis mono text-dim">
            <span>-24h</span><span>-18h</span><span>-12h</span><span>-6h</span><span>now</span>
          </div>
        </div>
        <div class="stats-card donut-card">
          <div class="sc-head">
            <span class="sc-title">{{ locale === 'zh' ? '严重度分布' : 'Severity' }}</span>
          </div>
          <div class="donut-wrap">
            <canvas ref="donutCanvas" width="120" height="120" />
            <div class="donut-legend">
              <div v-for="s in severityStats" :key="s.key" class="legend-row">
                <span class="dot" :style="{ background: s.color }" />
                <span class="lg-label">{{ $t(`alarms.severity.${s.key}`) }}</span>
                <span class="lg-val mono">{{ s.count }}</span>
              </div>
            </div>
          </div>
        </div>
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
import { ref, computed, reactive, watch, onMounted, nextTick } from 'vue'
import { useAlarmsStore } from '@/stores/alarms'
import { CHANNEL_DEFS } from '@/config/channels'
import type { AlarmRule } from '@/types/alarm'
import { useI18n } from 'vue-i18n'

const { locale } = useI18n()
const alarmsStore = useAlarmsStore()

// ─── Stats: 24-h histogram + severity donut ──────────────────────────
const histCanvas = ref<HTMLCanvasElement | null>(null)
const donutCanvas = ref<HTMLCanvasElement | null>(null)

const SEVERITY_COLORS: Record<string, string> = {
  high: '#ff3355', warn: '#ffaa00', low: '#00d9ff', info: '#5a7898',
}

const stats24h = computed(() => {
  const buckets = new Array(24).fill(0)
  const now = Date.now()
  const cutoff = now - 24 * 3600 * 1000
  let total = 0
  for (const ev of alarmsStore.events) {
    if (ev.timestamp < cutoff) continue
    const hoursAgo = Math.floor((now - ev.timestamp) / 3600000)
    const bucket = Math.max(0, Math.min(23, 23 - hoursAgo))
    buckets[bucket]++
    total++
  }
  return { buckets, total }
})

const severityStats = computed(() => {
  const counts: Record<string, number> = { high: 0, warn: 0, low: 0, info: 0 }
  for (const ev of alarmsStore.events) {
    counts[ev.severity] = (counts[ev.severity] ?? 0) + 1
  }
  return (['high', 'warn', 'low', 'info'] as const).map(k => ({
    key: k,
    count: counts[k],
    color: SEVERITY_COLORS[k],
  }))
})

function drawHistogram() {
  const canvas = histCanvas.value
  if (!canvas) return
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  const w = canvas.width, h = canvas.height
  ctx.clearRect(0, 0, w, h)

  const buckets = stats24h.value.buckets
  const max = Math.max(1, ...buckets)
  const barW = w / 24
  const gap = barW * 0.18

  for (let i = 0; i < 24; i++) {
    const x = i * barW + gap / 2
    const bw = barW - gap
    const bh = (buckets[i] / max) * (h - 4)
    const y = h - bh
    // Color hot = red, otherwise cyan
    const hot = buckets[i] >= max * 0.66
    ctx.fillStyle = hot ? 'rgba(255,51,85,0.85)' : 'rgba(0,217,255,0.7)'
    ctx.fillRect(x, y, bw, bh)
    if (hot) {
      ctx.shadowColor = '#ff3355'; ctx.shadowBlur = 6
      ctx.fillRect(x, y, bw, bh)
      ctx.shadowBlur = 0
    }
  }
}

function drawDonut() {
  const canvas = donutCanvas.value
  if (!canvas) return
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  const w = canvas.width, h = canvas.height
  ctx.clearRect(0, 0, w, h)
  const cx = w / 2, cy = h / 2, r = 48, ring = 14

  const stats = severityStats.value
  const total = stats.reduce((a, b) => a + b.count, 0)

  if (total === 0) {
    ctx.beginPath()
    ctx.arc(cx, cy, r, 0, Math.PI * 2)
    ctx.lineWidth = ring
    ctx.strokeStyle = 'rgba(90,120,152,0.25)'
    ctx.stroke()
  } else {
    let start = -Math.PI / 2
    for (const s of stats) {
      if (!s.count) continue
      const sweep = (s.count / total) * Math.PI * 2
      ctx.beginPath()
      ctx.arc(cx, cy, r, start, start + sweep)
      ctx.lineWidth = ring
      ctx.strokeStyle = s.color
      ctx.stroke()
      start += sweep
    }
  }

  // Total in centre
  ctx.fillStyle = '#e8f0f8'
  ctx.font = 'bold 22px ui-monospace, monospace'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(String(total), cx, cy - 4)
  ctx.fillStyle = '#5a7898'
  ctx.font = '9px ui-monospace, monospace'
  ctx.fillText(locale.value === 'zh' ? '总数' : 'Total', cx, cy + 12)
}

function redrawStats() {
  drawHistogram()
  drawDonut()
}

onMounted(() => nextTick(redrawStats))
watch(() => alarmsStore.events.length, () => nextTick(redrawStats))
watch(locale, () => nextTick(redrawStats))
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

.stats-panel {
  display: grid; grid-template-columns: 1fr 280px; gap: 8px;
  padding: 8px 12px; border-bottom: 1px solid var(--border);
  background: var(--bg-1);
}
.stats-card {
  background: var(--bg-2); border: 1px solid var(--border);
  border-radius: var(--r); padding: 8px 10px;
  display: flex; flex-direction: column; gap: 6px;
}
.sc-head { display: flex; justify-content: space-between; align-items: baseline; }
.sc-title { font-size: 10px; color: var(--text-2); letter-spacing: 0.1em; text-transform: uppercase; }
.sc-total { font-size: 16px; font-weight: 700; color: var(--text-0); }
.hist-canvas { width: 100%; height: 80px; display: block; }
.hist-axis {
  display: flex; justify-content: space-between;
  font-size: 9px; padding: 0 2px;
}
.donut-card { padding: 8px 12px; }
.donut-wrap { display: flex; align-items: center; gap: 12px; }
.donut-legend { flex: 1; display: flex; flex-direction: column; gap: 4px; font-size: 10.5px; }
.legend-row { display: flex; align-items: center; gap: 6px; }
.legend-row .dot { width: 7px; height: 7px; border-radius: 50%; }
.lg-label { flex: 1; color: var(--text-1); }
.lg-val { color: var(--text-0); font-weight: 600; }

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
