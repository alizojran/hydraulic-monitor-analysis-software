<template>
  <footer class="app-footer mono">
    <span class="f-item"><span class="f-key">SYS</span><span class="f-val text-green">READY</span></span>
    <span class="f-item"><span class="f-key">SOURCE</span><span class="f-val">{{ acqStore.dataSource.toUpperCase() }}</span></span>
    <span class="f-item"><span class="f-key">CH</span><span class="f-val">{{ totalChannels }}</span></span>
    <span class="f-item"><span class="f-key">FS</span><span class="f-val">{{ acqStore.sampleRate.toLocaleString() }} Hz</span></span>
    <span class="f-spacer" />
    <span class="f-item"><span class="f-key">CPU</span><span class="f-val">{{ cpuPct }}%</span></span>
    <span class="f-item"><span class="f-key">GPU</span><span class="f-val text-cyan">{{ uiStore.gpuName || 'WebGL2' }}</span></span>
    <span class="f-item"><span class="f-key">FPS</span><span class="f-val" :class="uiStore.fps >= 30 ? 'text-green' : 'text-amber'">{{ uiStore.fps }}</span></span>
    <span class="f-item"><span class="f-key">MEM</span><span class="f-val">{{ memUsed }}<span class="text-dim"> / {{ memTotal }} GB</span></span></span>
    <span class="f-item"><span class="f-key">NET</span><span class="f-val text-green">●</span><span class="f-val">{{ netLatency }}<span class="text-dim"> ms</span></span></span>
  </footer>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useAcquisitionStore } from '@/stores/acquisition'
import { useUiStore } from '@/stores/ui'
import { CHANNEL_DEFS } from '@/config/channels'

const acqStore = useAcquisitionStore()
const uiStore = useUiStore()
const totalChannels = CHANNEL_DEFS.length

const cpuPct = ref(14)
const memUsed = ref('3.8')
const netLatency = ref('1.2')
let timer: ReturnType<typeof setInterval> | null = null

const memTotal = computed(() => 16)

onMounted(() => {
  timer = setInterval(() => {
    cpuPct.value = Math.round(12 + Math.random() * 8)
    memUsed.value = (3.6 + Math.random() * 0.6).toFixed(1)
    netLatency.value = (0.8 + Math.random() * 0.8).toFixed(1)
  }, 1500)
})
onUnmounted(() => { if (timer) clearInterval(timer) })
</script>

<style scoped>
.app-footer {
  height: var(--footer-h);
  background: var(--bg-0);
  border-top: 1px solid var(--border);
  display: flex; align-items: center; gap: 14px;
  padding: 0 14px; flex-shrink: 0;
  font-size: 10.5px; color: var(--text-2);
  letter-spacing: 0.04em;
}
.f-item { display: flex; align-items: center; gap: 5px; }
.f-key { color: var(--text-dim); font-size: 10px; letter-spacing: 0.1em; }
.f-val { color: var(--text-1); }
.f-spacer { flex: 1; }
</style>
