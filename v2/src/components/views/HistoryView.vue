<template>
  <div class="history-view">
    <aside class="sidebar">
      <div class="section-title">{{ $t('history.sessions') }}</div>
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
        >{{ $t(`history.filter.${f}`) }}</button>
      </div>
      <div class="session-list">
        <div v-if="!filteredSessions.length" class="empty text-dim">{{ $t('history.noSessions') }}</div>
        <div
          v-for="s in filteredSessions"
          :key="s.id"
          class="session-item"
          :class="{ active: selectedId === s.id }"
          @click="selectedId = s.id"
        >
          <div class="si-date mono text-dim">{{ formatDate(s.startTime) }}</div>
          <div class="si-dur mono">{{ formatDuration(s.durationSec) }}</div>
          <div class="si-info text-dim">{{ s.sampleCount.toLocaleString() }} pts</div>
        </div>
      </div>
    </aside>

    <main class="center">
      <div class="placeholder">
        <template v-if="acqStore.dataSource !== 'simulated'">
          <div class="loaded-info">
            <div class="li-title">{{ $t('source.loaded') }}</div>
            <div class="li-stat">{{ acqStore.loadedFrames.length.toLocaleString() }} frames · {{ acqStore.loadedSampleRate }} Hz</div>
            <button class="primary" @click="playLoaded">▶ {{ $t('history.playback') }}</button>
          </div>
        </template>
        <template v-else>
          <DataSourceSwitcher @source-changed="onSourceChanged" />
          <div class="hint text-dim">{{ $t('history.noSessions') }}</div>
        </template>
      </div>
    </main>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { useAcquisitionStore } from '@/stores/acquisition'
import DataSourceSwitcher from '@/components/common/DataSourceSwitcher.vue'
import type { DataSource } from '@/stores/acquisition'

const acqStore = useAcquisitionStore()
const search = ref('')
const activeFilter = ref('all')
const selectedId = ref<string | null>(null)

const FILTERS = ['today', 'week', 'month', 'all']

interface SessionMeta {
  id: string
  startTime: number
  durationSec: number
  sampleCount: number
}

const sessions = ref<SessionMeta[]>([])

const filteredSessions = computed(() => {
  const now = Date.now()
  const cutoffs: Record<string, number> = {
    today: now - 86400e3,
    week: now - 7 * 86400e3,
    month: now - 30 * 86400e3,
    all: 0,
  }
  return sessions.value.filter(s => {
    if (s.startTime < cutoffs[activeFilter.value]) return false
    if (search.value && !formatDate(s.startTime).includes(search.value)) return false
    return true
  })
})

function formatDate(ts: number) {
  return new Date(ts).toLocaleString('zh-CN', { hour12: false })
}

function formatDuration(sec: number) {
  const m = Math.floor(sec / 60), s = Math.floor(sec % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

function playLoaded() {
  // In a full implementation, this would start playback of loaded frames
  // feeding them into acquisitionStore at the detected rate
  console.log('Playback of', acqStore.loadedFrames.length, 'frames')
}

function onSourceChanged(src: DataSource) {
  // handled by DataSourceSwitcher
}
</script>

<style scoped>
.history-view {
  display: grid;
  grid-template-columns: var(--sidebar-w) 1fr;
  height: 100%;
  overflow: hidden;
}
.sidebar {
  display: flex; flex-direction: column; gap: 6px;
  border-right: 1px solid var(--border); padding: 8px; overflow-y: auto;
}
.section-title { font-size: 10px; color: var(--text-2); letter-spacing: 0.1em; text-transform: uppercase; }
.search-wrap input { width: 100%; }
.filter-row { display: flex; gap: 4px; }
.filter-btn {
  flex: 1; padding: 4px 0; font-size: 10px; color: var(--text-2);
  background: var(--bg-2); border: 1px solid var(--border);
}
.filter-btn.active { background: rgba(0,217,255,0.1); color: var(--cyan); border-color: rgba(0,217,255,0.4); }
.session-list { flex: 1; display: flex; flex-direction: column; gap: 3px; }
.session-item {
  padding: 6px 8px; background: var(--bg-2); border: 1px solid var(--border);
  border-radius: var(--r); cursor: pointer; font-size: 11px;
}
.session-item:hover { border-color: var(--border-2); }
.session-item.active { border-color: var(--cyan); background: rgba(0,217,255,0.08); }
.si-date { font-size: 10px; }
.si-dur { font-size: 13px; font-weight: 600; color: var(--text-0); }
.empty { padding: 20px 0; text-align: center; font-size: 11px; }

.center { padding: 20px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 16px; }
.placeholder { display: flex; flex-direction: column; align-items: center; gap: 12px; width: 100%; max-width: 400px; }
.loaded-info { display: flex; flex-direction: column; align-items: center; gap: 8px; }
.li-title { font-size: 16px; font-weight: 600; color: var(--cyan); }
.li-stat { color: var(--text-1); font-family: var(--font-mono); font-size: 13px; }
.hint { font-size: 12px; margin-top: 8px; }
</style>
