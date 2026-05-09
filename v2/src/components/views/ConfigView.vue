<template>
  <div class="config-view">
    <div class="config-header">
      <span class="section-title">{{ $t('config.title') }}</span>
      <div class="spacer" />
      <button @click="saveAll">💾 {{ $t('config.save') }}</button>
      <button @click="exportConfig">{{ $t('config.export') }}</button>
      <button @click="triggerImport">{{ $t('config.import') }}</button>
      <button class="danger" @click="configStore.resetDefaults()">{{ $t('config.reset') }}</button>
      <input ref="importInput" type="file" accept=".json" style="display:none" @change="importConfig" />
      <span v-if="saved" class="saved-badge text-green">✓ {{ $t('config.saved') }}</span>
    </div>

    <div class="config-body">
      <!-- Channel config table -->
      <div class="config-section">
        <div class="section-title">{{ $t('config.channels') }}</div>
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

      <!-- Acquisition config -->
      <div class="config-section" style="margin-top:20px">
        <div class="section-title">{{ $t('config.acquisition') }}</div>
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
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useConfigStore } from '@/stores/config'
import { CHANNEL_DEFS } from '@/config/channels'

const configStore = useConfigStore()
const importInput = ref<HTMLInputElement | null>(null)
const saved = ref(false)

function saveAll() {
  // All edits are already auto-saved via store, just show feedback
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
.section-title { font-size: 10px; color: var(--text-2); letter-spacing: 0.1em; text-transform: uppercase; }
.spacer { flex: 1; }
.saved-badge { font-size: 12px; }
.config-body { flex: 1; overflow-y: auto; padding: 12px; }
.config-section { margin-bottom: 12px; }

.cfg-table { width: 100%; border-collapse: collapse; font-size: 12px; }
.cfg-table th { text-align: left; padding: 6px 8px; font-size: 10px; color: var(--text-2); font-weight: 500; border-bottom: 1px solid var(--border); background: var(--bg-1); position: sticky; top: 0; }
.cfg-table td { padding: 5px 8px; border-bottom: 1px solid var(--border); }
.cfg-table tr:hover td { background: var(--bg-hover); }

.acq-grid { display: flex; gap: 20px; flex-wrap: wrap; padding: 8px 0; }
.acq-item { display: flex; align-items: center; gap: 8px; font-size: 12px; }
.acq-item label { color: var(--text-2); min-width: 90px; }
</style>
