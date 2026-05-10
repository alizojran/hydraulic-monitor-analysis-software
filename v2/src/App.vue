<template>
  <div class="app-shell">
    <AppHeader @start="onStart" @stop="onStop" @pause="onPause" />
    <AppStatusBar />

    <div v-if="showSourceSwitcher" class="source-bar">
      <DataSourceSwitcher @source-changed="onSourceChanged" @file-loaded="onFileLoaded" />
    </div>

    <PlaybackControls v-if="showSourceSwitcher && acqStore.dataSource !== 'simulated'" />

    <div class="view-area">
      <RealtimeView v-if="uiStore.activeTab === 'realtime'" />
      <SpectrumView v-if="uiStore.activeTab === 'spectrum'" />
      <HistoryView v-if="uiStore.activeTab === 'history'" />
      <AlarmsView v-if="uiStore.activeTab === 'alarms'" />
      <ConfigView v-if="uiStore.activeTab === 'config'" />
    </div>

    <AppFooter />

    <div v-if="uiStore.loadingActive" class="loading-overlay">
      <div class="loading-box">
        <div class="loading-label">{{ uiStore.loadingLabel }}</div>
        <div class="loading-bar">
          <div class="loading-fill" :style="{ width: uiStore.loadingProgress + '%' }" />
        </div>
        <div class="loading-pct mono">{{ uiStore.loadingProgress }}%</div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useUiStore } from '@/stores/ui'
import { useAcquisitionStore } from '@/stores/acquisition'
import { useSimulator } from '@/composables/useSimulator'
import { useAcousticSpectrogram } from '@/composables/useAcousticSpectrogram'
import { usePlayback } from '@/composables/usePlayback'
import { useSessionStore } from '@/stores/session'
import AppHeader from '@/components/layout/AppHeader.vue'
import AppStatusBar from '@/components/layout/AppStatusBar.vue'
import AppFooter from '@/components/layout/AppFooter.vue'
import DataSourceSwitcher from '@/components/common/DataSourceSwitcher.vue'
import PlaybackControls from '@/components/common/PlaybackControls.vue'
import RealtimeView from '@/components/views/RealtimeView.vue'
import SpectrumView from '@/components/views/SpectrumView.vue'
import HistoryView from '@/components/views/HistoryView.vue'
import AlarmsView from '@/components/views/AlarmsView.vue'
import ConfigView from '@/components/views/ConfigView.vue'
import type { DataSource } from '@/stores/acquisition'

const uiStore = useUiStore()
const acqStore = useAcquisitionStore()
const { locale } = useI18n()
const sim = useSimulator()
const playback = usePlayback()
const sessionStore = useSessionStore()
useAcousticSpectrogram()

const showSourceSwitcher = computed(
  () => uiStore.activeTab === 'realtime' || uiStore.activeTab === 'history',
)

onMounted(() => {
  locale.value = uiStore.locale
  document.documentElement.lang = uiStore.locale === 'zh' ? 'zh-CN' : 'en'
  sim.start()
  sessionStore.beginSession()
})

function onStart() {
  sim.start()
  sessionStore.beginSession()
}
function onStop() {
  sim.stop()
  playback.stop()
  sessionStore.endSession({ source: acqStore.dataSource, sampleRate: acqStore.sampleRate })
}
function onPause() {
  if (acqStore.dataSource === 'simulated') {
    if (acqStore.isPaused) {
      sim.resume()
    } else {
      sim.pause()
    }
  } else {
    playback.togglePause()
  }
}
function onSourceChanged(src: DataSource) {
  // End any active session first, then stop the prior stream
  sessionStore.endSession({ source: acqStore.dataSource, sampleRate: acqStore.sampleRate })
  sim.stop()
  playback.stop()
  if (src === 'simulated') {
    sim.start()
    sessionStore.beginSession()
  }
  // For csv/wav we wait for the file to be loaded
}
function onFileLoaded() {
  if (acqStore.loadedFrames.length > 0) {
    acqStore.start()
    playback.play()
    sessionStore.beginSession()
  }
}
</script>

<style scoped>
.app-shell {
  display: flex;
  flex-direction: column;
  height: 100vh;
  overflow: hidden;
}
.source-bar {
  padding: 4px 12px;
  border-bottom: 1px solid var(--border);
  background: var(--bg-1);
  flex-shrink: 0;
}
.view-area {
  flex: 1;
  overflow: hidden;
  position: relative;
}
.view-area > * {
  position: absolute;
  inset: 0;
}

.loading-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}
.loading-box {
  background: var(--bg-3);
  border: 1px solid var(--border-2);
  border-radius: var(--r2);
  padding: 24px 32px;
  min-width: 280px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.loading-label {
  font-size: 13px;
  color: var(--text-1);
}
.loading-bar {
  height: 4px;
  background: var(--bg-2);
  border-radius: 2px;
  overflow: hidden;
}
.loading-fill {
  height: 100%;
  background: var(--cyan);
  transition: width 0.2s;
}
.loading-pct {
  font-size: 13px;
  color: var(--cyan);
  text-align: right;
}
</style>
