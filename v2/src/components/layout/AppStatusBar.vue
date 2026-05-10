<template>
  <div class="status-bar">
    <div class="status-item">
      <span class="dot" :class="statusClass" />
      <span class="mono">{{ statusLabel }}</span>
    </div>

    <div class="sep" />
    <div class="status-item">
      <span class="text-dim">{{ $t('status.sampleRate') }}</span>
      <span class="mono text-1">{{ acqStore.sampleRate.toLocaleString() }} Hz</span>
    </div>

    <div class="sep" />
    <div class="status-item">
      <span class="text-dim">{{ $t('status.channels') }}</span>
      <span class="mono text-green">{{ activeCount }}/{{ totalChannels }}</span>
    </div>

    <div class="sep" />
    <div class="status-item">
      <span class="text-dim">{{ $t('status.window') }}</span>
      <select class="win-sel" :value="acqStore.timeWindowSec" @change="onWindowChange">
        <option v-for="w in timeWindows" :key="w.value" :value="w.value">
          {{ locale === 'zh' ? w.labelZh : w.label }}
        </option>
      </select>
    </div>

    <div class="sep" />
    <div class="status-item">
      <span class="text-dim">{{ $t('status.buffer') }}</span>
      <div class="buf-bar"><div class="buf-fill" :style="{ width: bufferPct + '%' }" /></div>
      <span class="mono">{{ bufferPct }}%</span>
    </div>

    <div class="sep" />
    <div class="status-item">
      <span class="text-dim">{{ $t('status.elapsed') }}</span>
      <span class="mono text-1">{{ elapsedStr }}</span>
    </div>

    <div class="sep" />
    <div class="status-item">
      <span class="text-dim">{{ $t('source.title') }}</span>
      <span class="mono" :class="sourceClass">{{ sourceLabel }}</span>
    </div>

    <div class="status-item spacer" />

    <div v-if="uiStore.gpuAvailable" class="status-item">
      <span class="text-dim">GPU</span>
      <span class="mono text-cyan">{{ uiStore.gpuName }}</span>
    </div>
    <div class="sep" />
    <div class="status-item">
      <span class="text-dim">FPS</span>
      <span class="mono" :class="uiStore.fps >= 30 ? 'text-green' : 'text-amber'">{{
        uiStore.fps
      }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useAcquisitionStore } from '@/stores/acquisition'
import { useUiStore } from '@/stores/ui'
import { TIME_WINDOWS, CHANNEL_DEFS } from '@/config/channels'
import { useI18n } from 'vue-i18n'

const acqStore = useAcquisitionStore()
const uiStore = useUiStore()
const { t, locale } = useI18n()
const timeWindows = TIME_WINDOWS

const totalChannels = CHANNEL_DEFS.length
const activeCount = computed(() => totalChannels) // all channels active in sim

const statusClass = computed(() =>
  acqStore.isRunning && !acqStore.isPaused ? 'green' : acqStore.isPaused ? 'amber' : 'dim',
)
const statusLabel = computed(() =>
  acqStore.isRunning && !acqStore.isPaused
    ? t('status.running')
    : acqStore.isPaused
      ? t('status.paused')
      : t('status.stopped'),
)
const sourceLabel = computed(() => t(`source.${acqStore.dataSource}`))
const sourceClass = computed(() => (acqStore.dataSource === 'simulated' ? 'text-1' : 'text-cyan'))

const bufferPct = computed(() => {
  // Average buffer fill across all channels
  const ids = Object.keys(acqStore.channelBuffers)
  if (!ids.length) return 0
  let sum = 0
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const id of ids) sum += (acqStore.channelBuffers as any)[id]?.fillFraction ?? 0
  return Math.round((sum / ids.length) * 100)
})

const elapsedStr = computed(() => {
  const s = Math.max(0, Math.floor(acqStore.elapsedSec))
  const h = Math.floor(s / 3600),
    m = Math.floor((s % 3600) / 60),
    sec = s % 60
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(h)}:${pad(m)}:${pad(sec)}`
})

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
  gap: 10px;
  padding: 0 14px;
  flex-shrink: 0;
  font-size: 11.5px;
}
.status-item {
  display: flex;
  align-items: center;
  gap: 6px;
}
.spacer {
  flex: 1;
}
.sep {
  width: 1px;
  height: 14px;
  background: var(--border);
}

.dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  flex-shrink: 0;
}
.dot.green {
  background: var(--green);
  box-shadow: 0 0 6px var(--green);
}
.dot.amber {
  background: var(--amber);
  box-shadow: 0 0 6px var(--amber);
}
.dot.dim {
  background: var(--text-dim);
}

.win-sel {
  padding: 1px 4px;
  height: 20px;
  font-size: 11px;
}

.buf-bar {
  width: 56px;
  height: 5px;
  background: var(--bg-2);
  border: 1px solid var(--border);
  border-radius: 2px;
  overflow: hidden;
}
.buf-fill {
  height: 100%;
  background: linear-gradient(90deg, var(--green), var(--cyan));
  transition: width 0.4s;
}
</style>
