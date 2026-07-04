<template>
  <header class="app-header">
    <div class="brand">
      <div class="logo-tile">
        <svg
          viewBox="0 0 24 24"
          width="20"
          height="20"
          fill="none"
          stroke="currentColor"
          stroke-width="1.6"
        >
          <path d="M3 12h4l2-7 4 14 2-7h6" />
        </svg>
      </div>
      <div class="brand-text">
        <span class="brand-name">{{ $t('header.brand') }}</span>
        <span class="brand-sub">{{ $t('header.brandSub') }}</span>
      </div>
    </div>

    <nav class="tabs">
      <button
        v-for="tab in TABS"
        :key="tab.id"
        class="tab-btn"
        :class="{ active: uiStore.activeTab === tab.id }"
        @click="uiStore.setTab(tab.id)"
      >
        {{ $t(`header.tabs.${tab.id}`) }}
      </button>
    </nav>

    <div class="controls">
      <div class="clock-block mono">
        <span class="clock-time">{{ clock }}</span>
        <span class="clock-date">{{ dateStr }} · UTC{{ tzOffset }}</span>
      </div>

      <template v-if="acqStore.dataSource === 'simulated'">
        <button v-if="!acqStore.isRunning" class="primary" @click="$emit('start')">
          ▶ {{ $t('header.start') }}
        </button>
        <template v-else>
          <button @click="$emit('pause')">
            {{ acqStore.isPaused ? $t('header.resume') : $t('header.pause') }}
          </button>
          <button @click="$emit('stop')">■ {{ $t('header.stop') }}</button>
          <button class="rec-btn" :class="{ paused: acqStore.isPaused }">
            <span class="rec-dot" />
            {{ acqStore.isPaused ? $t('header.paused') : $t('header.rec') }}
          </button>
        </template>
      </template>

      <button class="hdr-btn" :title="$t('common.export')" @click="onExportCsv">⤓ CSV</button>
      <button class="hdr-btn" :title="$t('common.screenshot')" @click="onExportPng">⌘ PNG</button>
      <button class="lang-btn" @click="toggleLang">{{ $t('common.language') }}</button>
    </div>
  </header>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { useUiStore } from '@/stores/ui'
import { useAcquisitionStore } from '@/stores/acquisition'
import { useExport } from '@/composables/useExport'
import type { TabId } from '@/stores/ui'
import { useI18n } from 'vue-i18n'

const TABS: { id: TabId }[] = [
  { id: 'realtime' },
  { id: 'spectrum' },
  { id: 'history' },
  { id: 'alarms' },
  { id: 'config' },
]

const uiStore = useUiStore()
const acqStore = useAcquisitionStore()
const { locale } = useI18n()
const { exportCsv, exportPng } = useExport()

defineEmits<{ start: []; stop: []; pause: [] }>()

function onExportCsv() {
  exportCsv()
}
function onExportPng() {
  exportPng()
}

const clock = ref('')
const dateStr = ref('')
const tzOffset = ref('')
let clockTimer: ReturnType<typeof setInterval>

function pad(n: number, w = 2) {
  return String(n).padStart(w, '0')
}

function updateClock() {
  const d = new Date()
  clock.value = `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${pad(Math.floor(d.getMilliseconds() / 100), 1)}`
  dateStr.value = `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())}`
  const off = -d.getTimezoneOffset() / 60
  tzOffset.value = (off >= 0 ? '+' : '') + off
}

function toggleLang() {
  const next = uiStore.locale !== 'zh' ? 'zh' : 'en'
  uiStore.setLocale(next)
  locale.value = next
}

onMounted(() => {
  updateClock()
  clockTimer = setInterval(updateClock, 100)
})
onUnmounted(() => clearInterval(clockTimer))
</script>

<style scoped>
.app-header {
  height: var(--header-h);
  background: linear-gradient(180deg, var(--bg-1) 0%, var(--bg-0) 100%);
  border-bottom: 1px solid var(--border);
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 0 14px;
  flex-shrink: 0;
}

.brand {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 240px;
}
.logo-tile {
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--cyan);
  color: var(--cyan);
  background: rgba(0, 217, 255, 0.06);
  border-radius: var(--r);
  box-shadow:
    0 0 8px rgba(0, 217, 255, 0.2),
    inset 0 0 8px rgba(0, 217, 255, 0.05);
}
.brand-text {
  display: flex;
  flex-direction: column;
  line-height: 1.15;
}
.brand-name {
  font-size: 13px;
  font-weight: 700;
  color: var(--text-0);
  letter-spacing: 0.04em;
}
.brand-sub {
  font-size: 9.5px;
  color: var(--text-2);
  font-family: var(--font-mono);
  letter-spacing: 0.08em;
}

.tabs {
  display: flex;
  gap: 2px;
  flex: 1;
}
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
.tab-btn:hover {
  color: var(--text-1);
  background: var(--bg-hover);
  border-color: var(--border);
}
.tab-btn.active {
  color: var(--cyan);
  background: rgba(0, 217, 255, 0.1);
  border-color: rgba(0, 217, 255, 0.4);
  box-shadow: 0 0 8px rgba(0, 217, 255, 0.15);
}

.controls {
  display: flex;
  align-items: center;
  gap: 8px;
}
.clock-block {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  line-height: 1.15;
  padding-right: 10px;
  border-right: 1px solid var(--border);
  margin-right: 4px;
}
.clock-time {
  font-size: 18px;
  font-weight: 600;
  color: var(--text-0);
  letter-spacing: 0.02em;
}
.clock-date {
  font-size: 9.5px;
  color: var(--text-2);
  letter-spacing: 0.06em;
}

.rec-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  background: rgba(255, 51, 85, 0.1);
  border-color: var(--red);
  color: var(--red);
}
.rec-btn.paused {
  background: rgba(255, 170, 0, 0.1);
  border-color: var(--amber);
  color: var(--amber);
}
.rec-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--red);
  animation: blink 1.2s ease-in-out infinite;
}
.rec-btn.paused .rec-dot {
  background: var(--amber);
  animation: none;
}
@keyframes blink {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.2;
  }
}

.lang-btn {
  font-size: 11px;
  padding: 4px 10px;
}
.hdr-btn {
  font-size: 11px;
  padding: 4px 9px;
  font-family: var(--font-mono);
  letter-spacing: 0.04em;
}
.hdr-btn:hover {
  background: rgba(0, 217, 255, 0.1);
  border-color: var(--cyan);
  color: var(--cyan);
}
</style>
