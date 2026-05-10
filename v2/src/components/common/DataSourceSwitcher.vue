<template>
  <div class="ds-switcher">
    <span class="label text-dim">{{ $t('source.title') }}</span>
    <div class="seg">
      <button
        v-for="src in SOURCES"
        :key="src"
        class="seg-btn"
        :class="{ active: acqStore.dataSource === src }"
        @click="onSelect(src)"
      >
        {{ srcLabel(src) }}
      </button>
    </div>

    <!-- File drop zone for CSV / WAV -->
    <div
      v-if="showDrop"
      class="drop-zone"
      @dragover.prevent
      @drop.prevent="onDrop"
      @click="openFile"
    >
      <span v-if="uiStore.loadingActive">
        {{ uiStore.loadingLabel }} {{ uiStore.loadingProgress }}%
      </span>
      <span v-else>{{ $t('source.dropHint') }}</span>
      <input
        ref="fileInput"
        type="file"
        :accept="accept"
        style="display: none"
        @change="onFileInput"
      />
    </div>

    <!-- Web Serial inline controls -->
    <template v-if="acqStore.dataSource === 'webserial'">
      <template v-if="!serial.isSupported">
        <span class="ds-warn">{{
          $t('source.needsBrowser')
        }}</span>
      </template>
      <template v-else-if="serial.status.value !== 'connected'">
        <select v-model="baudRate" class="ds-select">
          <option v-for="b in BAUD_RATES" :key="b" :value="b">{{ b }}</option>
        </select>
        <button class="ds-act-btn" @click="serial.connect(baudRate)">
          {{ $t('source.connectSerial') }}
        </button>
      </template>
      <template v-else>
        <span class="ds-live mono">
          <span class="live-dot" />{{ serial.framesReceived.value }} fr
        </span>
        <button class="ds-disc-btn" @click="serial.disconnect()">✕</button>
      </template>
      <span v-if="serial.errorMsg.value" class="ds-err">{{ serial.errorMsg.value }}</span>
    </template>

    <!-- WebSocket inline controls -->
    <template v-if="acqStore.dataSource === 'websocket'">
      <template v-if="ws.status.value !== 'connected'">
        <input
          v-model="wsUrl"
          class="ds-input mono"
          placeholder="ws://localhost:8765"
          @keydown.enter="ws.connect(wsUrl)"
        />
        <button
          class="ds-act-btn"
          :disabled="ws.status.value === 'connecting' || ws.status.value === 'reconnecting'"
          @click="ws.connect(wsUrl)"
        >
          {{ $t('source.connect') }}
        </button>
      </template>
      <template v-else>
        <span class="ds-live mono">
          <span class="live-dot" />{{ ws.framesReceived.value }} fr
        </span>
        <button class="ds-disc-btn" @click="ws.disconnect()">✕</button>
      </template>
      <span v-if="ws.errorMsg.value" class="ds-err">{{ ws.errorMsg.value }}</span>
    </template>

    <!-- Modbus inline controls (Tauri only) -->
    <template v-if="acqStore.dataSource === 'modbus'">
      <template v-if="!isTauri">
        <span class="ds-warn">{{ $t('source.desktopOnly') }}</span>
      </template>
      <template v-else>
        <input
          v-model="modbusHost"
          class="ds-input mono"
          placeholder="192.168.1.100"
          style="width: 120px"
        />
        <input
          v-model.number="modbusPort"
          class="ds-input mono"
          type="number"
          placeholder="502"
          style="width: 60px"
        />
        <button class="ds-act-btn" @click="connectModbus">
          {{ $t('source.connect') }}
        </button>
      </template>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { useAcquisitionStore, type DataSource } from '@/stores/acquisition'
import { useUiStore } from '@/stores/ui'
import { useFileLoader } from '@/composables/useFileLoader'
import { useWebSerial, BAUD_RATES } from '@/composables/useWebSerial'
import { useWebSocket } from '@/composables/useWebSocket'

const SOURCES: DataSource[] = ['simulated', 'csv', 'wav', 'webserial', 'websocket', 'modbus']
const acqStore = useAcquisitionStore()
const uiStore = useUiStore()
const { loadCsv, loadWav } = useFileLoader()
const serial = useWebSerial()
const ws = useWebSocket()

const fileInput = ref<HTMLInputElement | null>(null)
const baudRate = ref<number>(115200)
const wsUrl = ref('ws://localhost:8765')
const modbusHost = ref('192.168.1.100')
const modbusPort = ref(502)

const isTauri = typeof window !== 'undefined' && '__TAURI__' in window

const showDrop = computed(() => acqStore.dataSource === 'csv' || acqStore.dataSource === 'wav')
const accept = computed(() => (acqStore.dataSource === 'csv' ? '.csv,.tsv,.txt' : '.wav'))

const LABELS: Record<DataSource, string> = {
  simulated: 'SIM',
  csv: 'CSV',
  wav: 'WAV',
  webserial: 'Serial',
  websocket: 'WS',
  modbus: 'Modbus',
}
function srcLabel(src: DataSource) {
  return LABELS[src]
}

const emit = defineEmits<{
  sourceChanged: [source: DataSource]
  fileLoaded: []
}>()

function onSelect(src: DataSource) {
  if (serial.status.value === 'connected') serial.disconnect()
  if (ws.status.value === 'connected') ws.disconnect()
  acqStore.setDataSource(src)
  emit('sourceChanged', src)
}

function openFile() {
  fileInput.value?.click()
}

async function handleFile(file: File) {
  try {
    if (acqStore.dataSource === 'csv') await loadCsv(file)
    else await loadWav(file)
    emit('fileLoaded')
  } catch (err) {
    console.error('[file] load failed:', err)
  }
}

function onDrop(e: DragEvent) {
  const file = e.dataTransfer?.files[0]
  if (file) handleFile(file)
}

function onFileInput(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (file) handleFile(file)
}

async function connectModbus() {
  if (!isTauri) return
  try {
    const mod = '@tauri-apps/api/core'
    const { invoke } = await import(/* @vite-ignore */ mod)
    await invoke('modbus_connect', { host: modbusHost.value, port: modbusPort.value, unitId: 1 })
    acqStore.setDataSource('modbus')
    acqStore.start()
  } catch (err) {
    console.error('Modbus connect failed:', err)
  }
}
</script>

<style scoped>
.ds-switcher {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.label {
  font-size: 11px;
}
.seg {
  display: flex;
  border: 1px solid var(--border);
  border-radius: var(--r);
  overflow: hidden;
}
.seg-btn {
  background: transparent;
  border: none;
  border-radius: 0;
  padding: 4px 10px;
  font-size: 11px;
  color: var(--text-2);
  border-right: 1px solid var(--border);
}
.seg-btn:last-child {
  border-right: none;
}
.seg-btn:hover {
  background: var(--bg-hover);
  color: var(--text-1);
}
.seg-btn.active {
  background: rgba(0, 217, 255, 0.1);
  color: var(--cyan);
}

.drop-zone {
  flex: 1;
  min-width: 180px;
  padding: 6px 12px;
  border: 1px dashed var(--border-2);
  border-radius: var(--r);
  text-align: center;
  font-size: 11px;
  color: var(--text-2);
  cursor: pointer;
  transition:
    border-color 0.15s,
    background 0.15s;
}
.drop-zone:hover {
  border-color: var(--cyan);
  background: rgba(0, 217, 255, 0.05);
  color: var(--text-1);
}

.ds-select,
.ds-input {
  background: var(--bg-2);
  border: 1px solid var(--border-2);
  color: var(--text-0);
  padding: 4px 7px;
  border-radius: var(--r);
  font-size: 11px;
}
.ds-input {
  font-family: var(--font-mono);
  width: 150px;
}
.ds-act-btn {
  padding: 4px 10px;
  font-size: 11px;
  background: rgba(0, 217, 255, 0.1);
  border: 1px solid rgba(0, 217, 255, 0.35);
  color: var(--cyan);
  border-radius: var(--r);
}
.ds-act-btn:hover {
  background: rgba(0, 217, 255, 0.2);
}
.ds-act-btn:disabled {
  opacity: 0.4;
  cursor: default;
}
.ds-disc-btn {
  padding: 3px 8px;
  font-size: 11px;
  background: rgba(255, 51, 85, 0.1);
  border: 1px solid rgba(255, 51, 85, 0.35);
  color: var(--red);
  border-radius: var(--r);
}
.ds-live {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 10px;
  color: var(--green);
}
.live-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--green);
  animation: blink 1.2s ease-in-out infinite;
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
.ds-warn {
  font-size: 11px;
  color: var(--amber);
}
.ds-err {
  font-size: 11px;
  color: var(--red);
}
</style>
