<template>
  <div class="config-view">
    <!-- Header toolbar -->
    <div class="config-header">
      <span class="brand-label">{{ $t('config.title') }}</span>
      <div class="spacer" />
      <button @click="saveAll">💾 {{ $t('config.save') }}</button>
      <button @click="exportConfig">{{ $t('config.export') }}</button>
      <button @click="triggerImport">{{ $t('config.import') }}</button>
      <button class="danger" @click="configStore.resetDefaults()">{{ $t('config.reset') }}</button>
      <input
        ref="importInput"
        type="file"
        accept=".json"
        style="display: none"
        @change="importConfig"
      />
      <span v-if="saved" class="saved-badge text-green">✓ {{ $t('config.saved') }}</span>
    </div>

    <!-- Profile switcher bar -->
    <ProfileSwitcher />

    <!-- Tab bar -->
    <div class="tab-bar">
      <button
        v-for="tab in TABS"
        :key="tab.id"
        class="tab-btn"
        :class="{ active: activeTab === tab.id }"
        @click="activeTab = tab.id"
      >
        {{ $t(tab.labelKey) }}
      </button>
    </div>

    <!-- Tab content -->
    <div class="config-body">
      <div v-show="activeTab === 'channel'" class="tab-pane">
        <ChannelConfigSection />
      </div>
      <div v-show="activeTab === 'acquisition'" class="tab-pane">
        <AcquisitionConfigSection />
      </div>
      <div v-show="activeTab === 'spectrum'" class="tab-pane">
        <SpectrumConfigSection />
      </div>
      <div v-show="activeTab === 'diagnostics'" class="tab-pane">
        <DiagnosticsConfigSection />
      </div>
      <div v-show="activeTab === 'alarms'" class="tab-pane">
        <div class="section-label">{{ $t('alarms.rules') }}</div>
        <AlarmRulesInline />
      </div>
      <div v-show="activeTab === 'system'" class="tab-pane">
        <SystemConfigSection />
      </div>
      <div v-show="activeTab === 'device-profile'" class="tab-pane">
        <DeviceProfileSection />
        <div class="section-divider" />
        <BaselineManager />
        <div class="section-divider" />
        <AIConfigSection />
      </div>
      <div v-show="activeTab === 'about'" class="tab-pane">
        <AboutSection />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useConfigStore } from '@/stores/config'
import ChannelConfigSection from '@/components/config/ChannelConfigSection.vue'
import AcquisitionConfigSection from '@/components/config/AcquisitionConfigSection.vue'
import SpectrumConfigSection from '@/components/config/SpectrumConfigSection.vue'
import DiagnosticsConfigSection from '@/components/config/DiagnosticsConfigSection.vue'
import SystemConfigSection from '@/components/config/SystemConfigSection.vue'
import AlarmRulesInline from '@/components/config/AlarmRulesInline.vue'
import ProfileSwitcher from '@/components/config/ProfileSwitcher.vue'
import AboutSection from '@/components/config/AboutSection.vue'
import DeviceProfileSection from '@/components/config/DeviceProfileSection.vue'
import BaselineManager from '@/components/config/BaselineManager.vue'
import AIConfigSection from '@/components/config/AIConfigSection.vue'

const configStore = useConfigStore()
const importInput = ref<HTMLInputElement | null>(null)
const saved = ref(false)
const activeTab = ref<string>('channel')

const TABS = [
  { id: 'channel', labelKey: 'config.tabs.channel' },
  { id: 'acquisition', labelKey: 'config.tabs.acquisition' },
  { id: 'spectrum', labelKey: 'config.tabs.spectrum' },
  { id: 'diagnostics', labelKey: 'config.tabs.diagnostics' },
  { id: 'alarms', labelKey: 'config.tabs.alarms' },
  { id: 'system', labelKey: 'config.tabs.system' },
  { id: 'device-profile', labelKey: 'config.tabs.deviceProfile' },
  { id: 'about', labelKey: 'config.tabs.about' },
]

function saveAll() {
  saved.value = true
  setTimeout(() => {
    saved.value = false
  }, 2000)
}

function exportConfig() {
  const json = configStore.exportConfig()
  const blob = new Blob([json], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `hmas-config-${new Date().toISOString().slice(0, 10)}.json`
  a.click()
  URL.revokeObjectURL(url)
}

function triggerImport() {
  importInput.value?.click()
}

async function importConfig(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (!file) return
  const text = await file.text()
  try {
    configStore.importConfig(text)
  } catch (err) {
    alert('Config import failed: ' + err)
  }
}
</script>

<style scoped>
.config-view {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}
.config-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
}
.brand-label {
  font-size: 10px;
  color: var(--text-2);
  letter-spacing: 0.1em;
  text-transform: uppercase;
}
.spacer {
  flex: 1;
}
.saved-badge {
  font-size: 12px;
}
.tab-bar {
  display: flex;
  gap: 2px;
  padding: 6px 12px 0;
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
  background: var(--bg-0);
}
.tab-btn {
  padding: 5px 14px;
  font-size: 11px;
  letter-spacing: 0.05em;
  background: transparent;
  border: 1px solid transparent;
  border-bottom: none;
  border-radius: 3px 3px 0 0;
  color: var(--text-2);
  cursor: pointer;
}
.tab-btn:hover {
  color: var(--text-1);
  background: var(--bg-1);
}
.tab-btn.active {
  color: var(--cyan);
  border-color: var(--border);
  border-bottom-color: var(--bg-0);
  background: var(--bg-0);
  margin-bottom: -1px;
  z-index: 1;
}
.config-body {
  flex: 1;
  overflow-y: auto;
}
.tab-pane {
  padding: 16px;
}
.section-divider {
  height: 1px;
  background: var(--border);
  margin: 16px 0;
}
.section-label {
  font-size: 10px;
  color: var(--text-2);
  letter-spacing: 0.1em;
  text-transform: uppercase;
  margin-bottom: 10px;
}
.mono {
  font-family: var(--font-mono);
}
.text-green {
  color: var(--green);
}
.danger {
  background: rgba(255, 51, 85, 0.08);
  border-color: rgba(255, 51, 85, 0.3);
  color: var(--red);
}
</style>
