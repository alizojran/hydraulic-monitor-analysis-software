<template>
  <div class="pc-card corners">
    <div class="c-br" />
    <div class="c-bl" />
    <div class="card-header">
      <span class="mono text-dim">F02</span>
      <span class="ch-name">{{ $t('channel.F02') }}</span>
      <span class="header-meta mono text-dim"
        >ISO 4406 · {{ lng('在线监测', 'Online') }}</span
      >
    </div>

    <div class="iso-code">
      <span class="code-val mono" :class="isoClass">{{ iso4 }}</span>
      <span class="code-sep mono">/</span>
      <span class="code-val mono" :class="isoClass">{{ iso6 }}</span>
      <span class="code-sep mono">/</span>
      <span class="code-val mono" :class="isoClass">{{ iso14 }}</span>
    </div>

    <div class="cleanliness" :class="cleanClass">
      <span class="clean-dot" />
      {{ cleanLabel }}
    </div>

    <div class="bin-list">
      <div v-for="bin in bins" :key="bin.label" class="bin-row">
        <span class="bin-label mono">&gt;{{ bin.label }}</span>
        <div class="bin-bar-wrap">
          <div class="bin-bar" :style="{ width: bin.pct + '%', background: bin.color }" />
        </div>
        <span class="bin-val mono">{{ bin.count.toLocaleString() }}</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useAcquisitionStore } from '@/stores/acquisition'
import { useI18n } from 'vue-i18n'
import { useLang } from '@/composables/useLang'

useI18n()
const { lng } = useLang()
const acqStore = useAcquisitionStore()

// Particle count drifts slowly — sample elapsedSec once per second.
// Computeds depend only on this tickedT, so they don't repaint at the
// 1 kHz frame-tick rate that elapsedSec gets updated.
const tickedT = ref(0)
let timer: ReturnType<typeof setInterval> | null = null
onMounted(() => {
  tickedT.value = acqStore.elapsedSec
  timer = setInterval(() => {
    tickedT.value = acqStore.elapsedSec
  }, 1000)
})
onUnmounted(() => {
  if (timer) clearInterval(timer)
})

const baseCode = computed(() => 16 + Math.sin(tickedT.value * 0.02) * 2)

const iso4 = computed(() => Math.round(baseCode.value).toString())
const iso6 = computed(() => Math.round(baseCode.value - 2).toString())
const iso14 = computed(() => Math.round(baseCode.value - 5).toString())

const isoNum = computed(() => Math.round(baseCode.value))
const isoClass = computed(() =>
  isoNum.value >= 19 ? 'text-red' : isoNum.value >= 18 ? 'text-amber' : 'text-cyan',
)

const cleanClass = computed(() =>
  isoNum.value >= 19 ? 'danger' : isoNum.value >= 18 ? 'warn' : 'ok',
)
const cleanLabel = computed(() =>
  isoNum.value >= 19
    ? lng('污染严重', 'CONTAMINATED')
    : isoNum.value >= 18
      ? lng('注意污染', 'MARGINAL')
      : lng('清洁度合格', 'CLEAN'),
)

const bins = computed(() => {
  const t = tickedT.value
  const c4 = Math.round(2180 + Math.sin(t * 0.05) * 100)
  const c6 = Math.round(540 + Math.sin(t * 0.07) * 30)
  const c14 = Math.round(68 + Math.sin(t * 0.11) * 8)
  return [
    { label: '4 μm', count: c4, pct: Math.min(100, (c4 / 3000) * 100), color: '#00d9ff' },
    { label: '6 μm', count: c6, pct: Math.min(100, (c6 / 1000) * 100), color: '#ffaa00' },
    { label: '14 μm', count: c14, pct: Math.min(100, (c14 / 200) * 100), color: '#ff3355' },
  ]
})
</script>

<style scoped>
.pc-card {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--r2);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.card-header {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 5px 10px;
  border-bottom: 1px solid var(--border);
  background: var(--bg-2);
  font-size: 11px;
}
.ch-name {
  flex: 1;
  color: var(--text-1);
}
.header-meta {
  font-size: 9.5px;
  letter-spacing: 0.05em;
}

.iso-code {
  display: flex;
  align-items: baseline;
  justify-content: center;
  padding: 10px 8px 2px;
  gap: 2px;
}
.code-val {
  font-size: 30px;
  font-weight: 700;
  line-height: 1;
}
.code-sep {
  font-size: 22px;
  color: var(--text-2);
  margin: 0 2px;
}

.cleanliness {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  font-size: 11px;
  font-family: var(--font-mono);
  padding: 3px 8px 8px;
  letter-spacing: 0.06em;
}
.cleanliness.ok {
  color: var(--green);
}
.cleanliness.warn {
  color: var(--amber);
}
.cleanliness.danger {
  color: var(--red);
}
.clean-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: currentColor;
}

.bin-list {
  display: flex;
  flex-direction: column;
  gap: 5px;
  padding: 6px 10px 10px;
  border-top: 1px solid var(--border);
}
.bin-row {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 10.5px;
}
.bin-label {
  color: var(--text-2);
  min-width: 42px;
  font-size: 10px;
}
.bin-bar-wrap {
  flex: 1;
  height: 5px;
  background: var(--bg-2);
  border: 1px solid var(--border);
  border-radius: 2px;
  overflow: hidden;
}
.bin-bar {
  height: 100%;
  border-radius: 2px;
  transition: width 0.4s;
}
.bin-val {
  color: var(--text-1);
  min-width: 48px;
  text-align: right;
}
</style>
