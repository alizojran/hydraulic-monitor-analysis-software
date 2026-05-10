<template>
  <div class="history-view">
    <aside class="sidebar">
      <div class="sidebar-head">
        <span class="section-title">{{ $t('history.sessions') }}</span>
        <button
          v-if="sessionStore.sessions.length"
          class="ghost mono"
          style="font-size: 10px; padding: 2px 6px"
          @click="onClearAll"
        >
          {{ $t('history.clearAll') }}
        </button>
      </div>
      <div class="search-wrap">
        <input v-model="search" type="text" :placeholder="$t('history.search')" />
      </div>
      <div class="filter-row">
        <button
          v-for="f in FILTERS"
          :key="f"
          class="filter-btn"
          :class="{ active: activeFilter === f }"
          @click="activeFilter = f"
        >
          {{ $t(`history.filter.${f}`) }}
        </button>
      </div>
      <div class="session-list">
        <div v-if="!filteredSessions.length" class="empty text-dim">
          {{ $t('history.noSessions') }}
        </div>
        <div
          v-for="s in filteredSessions"
          :key="s.id"
          class="session-item"
          :class="{ active: selectedId === s.id }"
          @click="selectedId = s.id"
        >
          <div class="si-row">
            <span class="si-date mono">{{ formatDate(s.startTime) }}</span>
            <span class="si-dur mono">{{ formatDuration(s.durationSec) }}</span>
          </div>
          <div class="si-row si-meta">
            <span class="si-src mono" :class="`src-${s.source}`">{{ s.source.toUpperCase() }}</span>
            <span class="text-dim">{{ s.sampleCount.toLocaleString() }} pts</span>
          </div>
        </div>
      </div>
    </aside>

    <main class="center">
      <!-- Selected session detail -->
      <template v-if="selected">
        <div class="detail">
          <div class="detail-head">
            <div>
              <div class="dh-title">{{ selected.label || formatDate(selected.startTime) }}</div>
              <div class="dh-meta mono text-dim">
                ID {{ selected.id }} · {{ selected.source.toUpperCase() }} ·
                {{ selected.sampleRate.toLocaleString() }} Hz
              </div>
            </div>
            <button class="danger" @click="onDelete(selected.id)">
              {{ $t('history.stop') }} / {{ $t('history.delete') }}
            </button>
          </div>
          <div class="detail-grid">
            <div class="stat-card">
              <div class="sc-label text-dim">{{ $t('history.start') }}</div>
              <div class="sc-val mono">{{ formatDate(selected.startTime) }}</div>
            </div>
            <div class="stat-card">
              <div class="sc-label text-dim">{{ $t('history.end') }}</div>
              <div class="sc-val mono">{{ formatDate(selected.endTime) }}</div>
            </div>
            <div class="stat-card">
              <div class="sc-label text-dim">{{ $t('history.duration') }}</div>
              <div class="sc-val mono text-cyan">{{ formatDuration(selected.durationSec) }}</div>
            </div>
            <div class="stat-card">
              <div class="sc-label text-dim">{{ $t('history.channels') }}</div>
              <div class="sc-val mono">{{ selected.channelIds.length }}</div>
            </div>
            <div class="stat-card">
              <div class="sc-label text-dim">{{ $t('history.samples') }}</div>
              <div class="sc-val mono">{{ selected.sampleCount.toLocaleString() }}</div>
            </div>
            <div class="stat-card">
              <div class="sc-label text-dim">{{ $t('history.estSize') }}</div>
              <div class="sc-val mono">{{ formatBytes(estimateBytes(selected)) }}</div>
            </div>
          </div>
          <div class="ch-pills">
            <span v-for="id in selected.channelIds" :key="id" class="ch-pill mono">{{ id }}</span>
          </div>
          <div class="hint text-dim">
            {{ $t('history.sessionMeta') }}
          </div>
        </div>
      </template>

      <template v-else>
        <div class="placeholder">
          <DataSourceSwitcher @source-changed="onSourceChanged" />
          <div class="hint text-dim">
            {{ filteredSessions.length ? $t('history.selectHint') : $t('history.noSessionsYet') }}
          </div>
        </div>
      </template>
    </main>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { useSessionStore } from '@/stores/session'
import DataSourceSwitcher from '@/components/common/DataSourceSwitcher.vue'
import type { DataSource } from '@/stores/acquisition'
import { useI18n } from 'vue-i18n'
import { useLang } from '@/composables/useLang'

const { t } = useI18n()
const { lng } = useLang()
const sessionStore = useSessionStore()
const search = ref('')
const activeFilter = ref('all')
const selectedId = ref<string | null>(null)

const FILTERS = ['today', 'week', 'month', 'all']

const filteredSessions = computed(() => {
  const now = Date.now()
  const cutoffs: Record<string, number> = {
    today: now - 86400e3,
    week: now - 7 * 86400e3,
    month: now - 30 * 86400e3,
    all: 0,
  }
  return [...sessionStore.sessions]
    .filter((s) => {
      if (s.startTime < cutoffs[activeFilter.value]) return false
      if (search.value) {
        const text = (s.label ?? '') + ' ' + s.source + ' ' + formatDate(s.startTime)
        if (!text.toLowerCase().includes(search.value.toLowerCase())) return false
      }
      return true
    })
    .sort((a, b) => b.startTime - a.startTime)
})

const selected = computed(() =>
  selectedId.value ? (sessionStore.sessions.find((s) => s.id === selectedId.value) ?? null) : null,
)

function formatDate(ts: number) {
  return new Date(ts).toLocaleString(lng('zh-CN', 'en-US'), { hour12: false })
}

function formatDuration(sec: number) {
  const h = Math.floor(sec / 3600),
    m = Math.floor((sec % 3600) / 60),
    s = Math.floor(sec % 60)
  return h > 0
    ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
    : `${m}:${String(s).padStart(2, '0')}`
}

function estimateBytes(s: { sampleCount: number; channelIds: string[] }): number {
  // 4 bytes/sample × channels × sample count (uncompressed Float32)
  return s.sampleCount * s.channelIds.length * 4
}
function formatBytes(b: number): string {
  if (b < 1024) return `${b} B`
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`
  if (b < 1024 ** 3) return `${(b / 1024 / 1024).toFixed(1)} MB`
  return `${(b / 1024 ** 3).toFixed(2)} GB`
}

function onDelete(id: string) {
  sessionStore.deleteSession(id)
  if (selectedId.value === id) selectedId.value = null
}

function onClearAll() {
  if (confirm(t('history.confirmClear'))) {
    sessionStore.clearAll()
    selectedId.value = null
  }
}

function onSourceChanged(_src: DataSource) {
  // handled by the switcher
}
</script>

<style scoped>
.history-view {
  display: grid;
  grid-template-columns: 240px 1fr;
  height: 100%;
  overflow: hidden;
}
.sidebar {
  display: flex;
  flex-direction: column;
  gap: 6px;
  border-right: 1px solid var(--border);
  padding: 8px;
  overflow-y: auto;
  background: var(--bg-0);
}
.sidebar-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.section-title {
  font-size: 10px;
  color: var(--text-2);
  letter-spacing: 0.1em;
  text-transform: uppercase;
}

.search-wrap input {
  width: 100%;
}
.filter-row {
  display: flex;
  gap: 4px;
}
.filter-btn {
  flex: 1;
  padding: 4px 0;
  font-size: 10px;
  color: var(--text-2);
  background: var(--bg-2);
  border: 1px solid var(--border);
}
.filter-btn.active {
  background: rgba(0, 217, 255, 0.1);
  color: var(--cyan);
  border-color: rgba(0, 217, 255, 0.4);
}

.session-list {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 3px;
}
.session-item {
  padding: 6px 8px;
  background: var(--bg-2);
  border: 1px solid var(--border);
  border-radius: var(--r);
  cursor: pointer;
  font-size: 11px;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.session-item:hover {
  border-color: var(--border-2);
}
.session-item.active {
  border-color: var(--cyan);
  background: rgba(0, 217, 255, 0.08);
}
.si-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.si-date {
  font-size: 10.5px;
  color: var(--text-1);
}
.si-dur {
  font-size: 12px;
  font-weight: 600;
  color: var(--cyan);
}
.si-meta {
  font-size: 9.5px;
}
.si-src {
  padding: 1px 4px;
  border-radius: 2px;
  letter-spacing: 0.06em;
}
.src-simulated {
  background: rgba(0, 217, 255, 0.12);
  color: var(--cyan);
}
.src-csv {
  background: rgba(0, 255, 149, 0.12);
  color: var(--green);
}
.src-wav {
  background: rgba(255, 170, 0, 0.12);
  color: var(--amber);
}
.empty {
  padding: 20px 0;
  text-align: center;
  font-size: 11px;
}

.center {
  padding: 24px;
  overflow-y: auto;
}
.placeholder {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
  padding: 60px 20px;
}
.hint {
  font-size: 12px;
}

.detail {
  display: flex;
  flex-direction: column;
  gap: 16px;
  max-width: 720px;
}
.detail-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding-bottom: 12px;
  border-bottom: 1px solid var(--border);
}
.dh-title {
  font-size: 16px;
  font-weight: 600;
  color: var(--text-0);
}
.dh-meta {
  font-size: 11px;
  margin-top: 4px;
}

.detail-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
}
.stat-card {
  background: var(--bg-2);
  border: 1px solid var(--border);
  border-radius: var(--r);
  padding: 10px 12px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.sc-label {
  font-size: 10px;
  letter-spacing: 0.05em;
}
.sc-val {
  font-size: 13px;
  color: var(--text-1);
}

.ch-pills {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}
.ch-pill {
  padding: 2px 6px;
  background: var(--bg-2);
  border: 1px solid var(--border);
  border-radius: 2px;
  font-size: 10px;
  color: var(--text-2);
}
</style>
