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
      >{{ $t(`source.${src}`) }}</button>
    </div>
    <div v-if="showDrop" class="drop-zone" @dragover.prevent @drop.prevent="onDrop" @click="openFile">
      <span v-if="uiStore.loadingActive">
        {{ uiStore.loadingLabel }} {{ uiStore.loadingProgress }}%
      </span>
      <span v-else>{{ $t('source.dropHint') }}</span>
      <input ref="fileInput" type="file" :accept="accept" style="display:none" @change="onFileInput" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { useAcquisitionStore, type DataSource } from '@/stores/acquisition'
import { useUiStore } from '@/stores/ui'
import { useFileLoader } from '@/composables/useFileLoader'

const SOURCES: DataSource[] = ['simulated', 'csv', 'wav']
const acqStore = useAcquisitionStore()
const uiStore = useUiStore()
const { loadCsv, loadWav } = useFileLoader()
const fileInput = ref<HTMLInputElement | null>(null)

const showDrop = computed(() => acqStore.dataSource === 'csv' || acqStore.dataSource === 'wav')
const accept = computed(() => acqStore.dataSource === 'csv' ? '.csv,.tsv,.txt' : '.wav')

const emit = defineEmits<{
  sourceChanged: [source: DataSource]
  fileLoaded: []
}>()

function onSelect(src: DataSource) {
  acqStore.setDataSource(src)
  emit('sourceChanged', src)
}

function openFile() { fileInput.value?.click() }

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
</script>

<style scoped>
.ds-switcher { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.label { font-size: 11px; }
.seg { display: flex; border: 1px solid var(--border); border-radius: var(--r); overflow: hidden; }
.seg-btn {
  background: transparent; border: none; border-radius: 0;
  padding: 4px 12px; font-size: 11px; color: var(--text-2);
  border-right: 1px solid var(--border);
}
.seg-btn:last-child { border-right: none; }
.seg-btn:hover { background: var(--bg-hover); color: var(--text-1); }
.seg-btn.active { background: rgba(0,217,255,0.1); color: var(--cyan); }

.drop-zone {
  flex: 1;
  min-width: 200px;
  padding: 6px 12px;
  border: 1px dashed var(--border-2);
  border-radius: var(--r);
  text-align: center;
  font-size: 11px;
  color: var(--text-2);
  cursor: pointer;
  transition: border-color 0.15s, background 0.15s;
}
.drop-zone:hover { border-color: var(--cyan); background: rgba(0,217,255,0.05); color: var(--text-1); }
</style>
