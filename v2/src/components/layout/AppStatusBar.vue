<template>
  <div class="status-bar">
    <div class="status-item">
      <span class="dot" :class="statusClass" />
      <span class="mono">{{ statusLabel }}</span>
    </div>
    <div class="status-item">
      <span class="text-dim">{{ $t('status.sampleRate') }}</span>
      <span class="mono">{{ acqStore.sampleRate.toLocaleString() }} Hz</span>
    </div>
    <div class="status-item">
      <span class="text-dim">{{ $t('status.window') }}</span>
      <select class="win-sel" :value="acqStore.timeWindowSec" @change="onWindowChange">
        <option v-for="w in timeWindows" :key="w.value" :value="w.value">
          {{ locale === 'zh' ? w.labelZh : w.label }}
        </option>
      </select>
    </div>
    <div class="status-item">
      <span class="text-dim">{{ $t('source.title') }}</span>
      <span class="mono" :class="sourceClass">{{ sourceLabel }}</span>
    </div>
    <div class="status-item spacer" />
    <div class="status-item" v-if="uiStore.gpuAvailable">
      <span class="text-dim">GPU</span>
      <span class="mono text-cyan">{{ uiStore.gpuName }}</span>
    </div>
    <div class="status-item">
      <span class="text-dim">FPS</span>
      <span class="mono" :class="uiStore.fps >= 30 ? 'text-green' : 'text-amber'">{{ uiStore.fps }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useAcquisitionStore } from '@/stores/acquisition'
import { useUiStore } from '@/stores/ui'
import { TIME_WINDOWS } from '@/config/channels'
import { useI18n } from 'vue-i18n'

const acqStore = useAcquisitionStore()
const uiStore = useUiStore()
const { t, locale } = useI18n()
const timeWindows = TIME_WINDOWS

const statusClass = computed(() =>
  acqStore.isRunning && !acqStore.isPaused ? 'green' : acqStore.isPaused ? 'amber' : 'dim'
)
const statusLabel = computed(() =>
  acqStore.isRunning && !acqStore.isPaused ? t('status.running') : acqStore.isPaused ? t('status.paused') : t('status.stopped')
)
const sourceLabel = computed(() => t(`source.${acqStore.dataSource}`))
const sourceClass = computed(() => acqStore.dataSource === 'simulated' ? 'text-1' : 'text-cyan')

function onWindowChange(e: Event) {
  acqStore.setTimeWindow(parseInt((e.target as HTMLSelectElement).value))
}
</script>

<style scoped>
.status-bar {
  height: var(--statusbar-h);
  background: var(--bg-0);
  border-bottom: 1px solid var(--border);
  display: flex;
  align-items: center;
  gap: 20px;
  padding: 0 16px;
  flex-shrink: 0;
}
.status-item { display: flex; align-items: center; gap: 6px; font-size: 12px; }
.spacer { flex: 1; }
.dot { width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0; }
.dot.green { background: var(--green); box-shadow: 0 0 6px var(--green); }
.dot.amber { background: var(--amber); }
.dot.dim   { background: var(--text-dim); }
.win-sel { padding: 2px 6px; height: 22px; font-size: 11px; }
</style>
