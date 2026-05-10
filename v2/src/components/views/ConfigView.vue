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
      <input ref="importInput" type="file" accept=".json" style="display:none" @change="importConfig" />
      <span v-if="saved" class="saved-badge text-green">✓ {{ $t('config.saved') }}</span>
    </div>

    <!-- Tab bar -->
    <div class="tab-bar">
      <button v-for="tab in TABS" :key="tab.id"
        class="tab-btn" :class="{ active: activeTab === tab.id }"
        @click="activeTab = tab.id">
        {{ $t(tab.labelKey) }}
      </button>
    </div>

    <!-- Tab content -->
    <div class="config-body">
      <!-- Tab: Channel -->
      <div v-show="activeTab === 'channel'" class="tab-pane">
        <div class="section-label">{{ $t('config.channels') }}</div>
        <table class="cfg-table">
          <thead>
            <tr>
              <th>{{ $t('config.ch.id') }}</th>
              <th>{{ $t('config.ch.name') }}</th>
              <th>{{ $t('config.ch.enabled') }}</th>
              <th>{{ $t('config.ch.coupling') }}</th>
              <th>{{ $t('config.ch.range') }}</th>
              <th>{{ $t('config.ch.unit') }}</th>
              <th>{{ $t('config.ch.filter') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="ch in CHANNEL_DEFS" :key="ch.id">
              <td class="mono" :style="{ color: ch.hex }">{{ ch.id }}</td>
              <td>
                <input v-model="configStore.channels[ch.id].name" type="text" style="width:140px" />
              </td>
              <td>
                <input type="checkbox" :checked="configStore.channels[ch.id].enabled"
                  @change="configStore.updateChannel(ch.id, { enabled: ($event.target as HTMLInputElement).checked })" />
              </td>
              <td>
                <select :value="configStore.channels[ch.id].coupling"
                  @change="configStore.updateChannel(ch.id, { coupling: ($event.target as HTMLSelectElement).value as any })">
                  <option>DC</option><option>AC</option><option>IEPE</option>
                </select>
              </td>
              <td class="mono text-dim">{{ ch.min }} – {{ ch.max }}</td>
              <td class="mono text-dim">{{ ch.unit }}</td>
              <td>
                <input v-model="configStore.channels[ch.id].filter" type="text" style="width:90px" />
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Tab: Acquisition -->
      <div v-show="activeTab === 'acquisition'" class="tab-pane">
        <div class="section-label">{{ $t('config.acquisition') }}</div>
        <div class="acq-grid">
          <div class="acq-item">
            <label>{{ $t('config.acq.sampleRate') }}</label>
            <select :value="configStore.acquisition.sampleRate"
              @change="configStore.updateAcq({ sampleRate: parseInt(($event.target as HTMLSelectElement).value) })">
              <option v-for="r in [100, 1000, 5000, 10000, 25000, 50000, 100000]" :key="r" :value="r">{{ r.toLocaleString() }} Hz</option>
            </select>
          </div>
          <div class="acq-item">
            <label>{{ $t('config.acq.trigger') }}</label>
            <select :value="configStore.acquisition.triggerType"
              @change="configStore.updateAcq({ triggerType: ($event.target as HTMLSelectElement).value as any })">
              <option value="software">Software</option>
              <option value="edge-rising">Edge Rising</option>
              <option value="edge-falling">Edge Falling</option>
              <option value="window">Window</option>
            </select>
          </div>
          <div class="acq-item">
            <label>{{ $t('config.acq.preTrigger') }}</label>
            <input type="number" :value="configStore.acquisition.preTriggerPct" min="0" max="99"
              @change="configStore.updateAcq({ preTriggerPct: parseInt(($event.target as HTMLInputElement).value) })" />
            <span class="text-dim">%</span>
          </div>
          <div class="acq-item">
            <label>{{ $t('config.acq.postTrigger') }}</label>
            <input type="number" :value="configStore.acquisition.postTriggerPct" min="1" max="100"
              @change="configStore.updateAcq({ postTriggerPct: parseInt(($event.target as HTMLInputElement).value) })" />
            <span class="text-dim">%</span>
          </div>
          <div class="acq-item">
            <label>{{ $t('config.acq.trigger') }} Ch</label>
            <select :value="configStore.acquisition.triggerChannel"
              @change="configStore.updateAcq({ triggerChannel: ($event.target as HTMLSelectElement).value })">
              <option v-for="ch in CHANNEL_DEFS" :key="ch.id" :value="ch.id">{{ ch.id }}</option>
            </select>
          </div>
          <div class="acq-item">
            <label>Trigger Level</label>
            <input type="number" :value="configStore.acquisition.triggerLevel"
              @change="configStore.updateAcq({ triggerLevel: parseFloat(($event.target as HTMLInputElement).value) })" />
          </div>
        </div>
      </div>

      <!-- Tab: Spectrum -->
      <div v-show="activeTab === 'spectrum'" class="tab-pane">
        <SpectrumConfigSection />
      </div>

      <!-- Tab: Diagnostics -->
      <div v-show="activeTab === 'diagnostics'" class="tab-pane">
        <DiagnosticsConfigSection />
      </div>

      <!-- Tab: Alarms -->
      <div v-show="activeTab === 'alarms'" class="tab-pane">
        <div class="section-label">{{ $t('alarms.rules') }}</div>
        <AlarmRulesInline />
      </div>

      <!-- Tab: System -->
      <div v-show="activeTab === 'system'" class="tab-pane">
        <SystemConfigSection />
      </div>

      <!-- Tab: About -->
      <div v-show="activeTab === 'about'" class="tab-pane">
        <div class="section-label">{{ $t('config.about.title') }}</div>
        <div class="about-grid">
          <div class="about-row"><span class="about-key">{{ $t('config.about.version') }}</span><span class="about-val mono">v2.0.0</span></div>
          <div class="about-row"><span class="about-key">{{ $t('config.about.build') }}</span><span class="about-val mono">2026-05-10</span></div>
          <div class="about-row"><span class="about-key">Runtime</span><span class="about-val mono">Vue 3 + Pinia + Vite</span></div>
          <div class="about-row"><span class="about-key">Rendering</span><span class="about-val mono">WebGL2 + Canvas2D</span></div>
          <div class="about-row"><span class="about-key">Signal</span><span class="about-val mono">FFT · Octave · Bearing · Gear · Envelope</span></div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useConfigStore } from '@/stores/config'
import { CHANNEL_DEFS } from '@/config/channels'
import SpectrumConfigSection from '@/components/config/SpectrumConfigSection.vue'
import DiagnosticsConfigSection from '@/components/config/DiagnosticsConfigSection.vue'
import SystemConfigSection from '@/components/config/SystemConfigSection.vue'
import AlarmRulesInline from '@/components/config/AlarmRulesInline.vue'

const configStore = useConfigStore()
const importInput = ref<HTMLInputElement | null>(null)
const saved = ref(false)
const activeTab = ref<string>('channel')

const TABS = [
  { id: 'channel',     labelKey: 'config.tabs.channel' },
  { id: 'acquisition', labelKey: 'config.tabs.acquisition' },
  { id: 'spectrum',    labelKey: 'config.tabs.spectrum' },
  { id: 'diagnostics', labelKey: 'config.tabs.diagnostics' },
  { id: 'alarms',      labelKey: 'config.tabs.alarms' },
  { id: 'system',      labelKey: 'config.tabs.system' },
  { id: 'about',       labelKey: 'config.tabs.about' },
]

function saveAll() {
  saved.value = true
  setTimeout(() => { saved.value = false }, 2000)
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

function triggerImport() { importInput.value?.click() }

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
.config-view { display: flex; flex-direction: column; height: 100%; overflow: hidden; }

.config-header {
  display: flex; align-items: center; gap: 8px;
  padding: 8px 12px; border-bottom: 1px solid var(--border); flex-shrink: 0;
}
.brand-label { font-size: 10px; color: var(--text-2); letter-spacing: 0.1em; text-transform: uppercase; }
.spacer { flex: 1; }
.saved-badge { font-size: 12px; }

.tab-bar {
  display: flex; gap: 2px;
  padding: 6px 12px 0; border-bottom: 1px solid var(--border); flex-shrink: 0;
  background: var(--bg-0);
}
.tab-btn {
  padding: 5px 14px; font-size: 11px; letter-spacing: 0.05em;
  background: transparent; border: 1px solid transparent;
  border-bottom: none; border-radius: 3px 3px 0 0;
  color: var(--text-2); cursor: pointer;
}
.tab-btn:hover { color: var(--text-1); background: var(--bg-1); }
.tab-btn.active {
  color: var(--cyan); border-color: var(--border); border-bottom-color: var(--bg-0);
  background: var(--bg-0); margin-bottom: -1px; z-index: 1;
}

.config-body { flex: 1; overflow-y: auto; }
.tab-pane { padding: 16px 16px; }

.section-label { font-size: 10px; color: var(--text-2); letter-spacing: 0.1em; text-transform: uppercase; margin-bottom: 10px; }

/* Channel table */
.cfg-table { width: 100%; border-collapse: collapse; font-size: 12px; }
.cfg-table th { text-align: left; padding: 6px 8px; font-size: 10px; color: var(--text-2); font-weight: 500; border-bottom: 1px solid var(--border); background: var(--bg-1); position: sticky; top: 0; }
.cfg-table td { padding: 5px 8px; border-bottom: 1px solid var(--border); }
.cfg-table tr:hover td { background: var(--bg-hover); }

/* Acquisition grid */
.acq-grid { display: flex; gap: 20px; flex-wrap: wrap; padding: 4px 0; }
.acq-item { display: flex; align-items: center; gap: 8px; font-size: 12px; }
.acq-item label { color: var(--text-2); min-width: 100px; font-size: 11px; }
.acq-item input[type="number"] { width: 80px; background: var(--bg-2); border: 1px solid var(--border); border-radius: 2px; padding: 3px 8px; color: var(--text-1); font-family: var(--font-mono); font-size: 12px; outline: none; }
.acq-item select { font-size: 12px; padding: 3px 6px; height: 26px; }

/* About */
.about-grid { display: flex; flex-direction: column; gap: 8px; max-width: 520px; }
.about-row { display: grid; grid-template-columns: 120px 1fr; gap: 16px; padding: 6px 8px; background: var(--bg-1); border: 1px solid var(--border); border-radius: 2px; font-size: 12px; }
.about-key { color: var(--text-2); font-size: 11px; }
.about-val { color: var(--text-1); }

.mono { font-family: var(--font-mono); }
.text-dim { color: var(--text-2); }
.danger { background: rgba(255,51,85,0.08); border-color: rgba(255,51,85,0.3); color: var(--red); }
</style>
