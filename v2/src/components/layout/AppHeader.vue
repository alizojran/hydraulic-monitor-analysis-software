<template>
  <header class="app-header">
    <div class="brand">
      <span class="brand-name">{{ $t('header.brand') }}</span>
      <span class="brand-sub">{{ $t('header.brandSub') }}</span>
    </div>

    <nav class="tabs">
      <button
        v-for="tab in TABS"
        :key="tab.id"
        class="tab-btn"
        :class="{ active: uiStore.activeTab === tab.id }"
        @click="uiStore.setTab(tab.id)"
      >{{ $t(`header.tabs.${tab.id}`) }}</button>
    </nav>

    <div class="controls">
      <div class="clock mono">{{ clock }}</div>

      <template v-if="acqStore.dataSource === 'simulated'">
        <button v-if="!acqStore.isRunning" class="primary" @click="$emit('start')">▶ {{ $t('header.start') }}</button>
        <template v-else>
          <button class="rec-btn" :class="{ paused: acqStore.isPaused }">
            <span class="rec-dot" />
            {{ acqStore.isPaused ? $t('header.paused') : $t('header.rec') }}
          </button>
          <button @click="$emit('pause')">{{ acqStore.isPaused ? $t('header.resume') : $t('header.pause') }}</button>
          <button @click="$emit('stop')">■ {{ $t('header.stop') }}</button>
        </template>
      </template>

      <button class="lang-btn" @click="toggleLang">{{ $t('common.language') }}</button>
    </div>
  </header>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { useUiStore } from '@/stores/ui'
import { useAcquisitionStore } from '@/stores/acquisition'
import type { TabId } from '@/stores/ui'
import { useI18n } from 'vue-i18n'

const TABS: { id: TabId }[] = [
  { id: 'realtime' }, { id: 'spectrum' }, { id: 'history' }, { id: 'alarms' }, { id: 'config' }
]

const uiStore = useUiStore()
const acqStore = useAcquisitionStore()
const { locale } = useI18n()

defineEmits<{ start: []; stop: []; pause: [] }>()

const clock = ref('')
let clockTimer: ReturnType<typeof setInterval>

function updateClock() {
  const d = new Date()
  clock.value = d.toLocaleTimeString('zh-CN', { hour12: false })
}

function toggleLang() {
  const next = uiStore.locale === 'zh' ? 'en' : 'zh'
  uiStore.setLocale(next)
  locale.value = next
}

onMounted(() => { updateClock(); clockTimer = setInterval(updateClock, 1000) })
onUnmounted(() => clearInterval(clockTimer))
</script>

<style scoped>
.app-header {
  height: var(--header-h);
  background: var(--bg-1);
  border-bottom: 1px solid var(--border);
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 0 16px;
  flex-shrink: 0;
}

.brand {
  display: flex;
  flex-direction: column;
  min-width: 200px;
}
.brand-name { font-size: 13px; font-weight: 700; color: var(--cyan); letter-spacing: 0.02em; }
.brand-sub { font-size: 10px; color: var(--text-2); font-family: var(--font-mono); }

.tabs { display: flex; gap: 2px; flex: 1; }
.tab-btn {
  background: transparent;
  border: 1px solid transparent;
  color: var(--text-2);
  padding: 6px 18px;
  font-size: 12px;
  font-weight: 500;
  letter-spacing: 0.04em;
  border-radius: var(--r);
  transition: all 0.15s;
}
.tab-btn:hover { color: var(--text-1); background: var(--bg-hover); border-color: var(--border); }
.tab-btn.active { color: var(--cyan); background: rgba(0,217,255,0.1); border-color: rgba(0,217,255,0.4); }

.controls { display: flex; align-items: center; gap: 8px; }
.clock { font-size: 14px; color: var(--text-1); min-width: 80px; text-align: right; }

.rec-btn {
  display: flex; align-items: center; gap: 6px;
  background: rgba(255,51,85,0.1); border-color: var(--red); color: var(--red);
}
.rec-btn.paused { background: rgba(255,170,0,0.1); border-color: var(--amber); color: var(--amber); }
.rec-dot {
  width: 8px; height: 8px; border-radius: 50%;
  background: var(--red); animation: blink 1.2s ease-in-out infinite;
}
.rec-btn.paused .rec-dot { background: var(--amber); animation: none; }
@keyframes blink { 0%,100%{opacity:1} 50%{opacity:0.2} }

.lang-btn { font-size: 11px; padding: 4px 10px; }
</style>
