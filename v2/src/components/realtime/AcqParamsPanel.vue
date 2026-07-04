<template>
  <div class="acq-panel">
    <!-- Acquisition params -->
    <div class="section-head">{{ $t('realtime.acqParams') }}</div>
    <div class="param-list">
      <div class="param-row">
        <span class="pk">{{ $t('config.acq.sampleRate') }}</span>
        <span class="pv mono">{{ (acqStore.sampleRate / 1000).toFixed(0) }} kHz</span>
      </div>
      <div class="param-row">
        <span class="pk">{{ $t('realtime.resolution') }}</span>
        <span class="pv mono text-cyan">16-bit</span>
      </div>
      <div class="param-row">
        <span class="pk">{{ $t('realtime.antiAlias') }}</span>
        <span class="pv mono">{{ ((acqStore.sampleRate * 0.4) / 1000).toFixed(1) }} kHz</span>
      </div>
      <div class="param-row">
        <span class="pk">{{ $t('realtime.sync') }}</span>
        <span class="pv mono">INT</span>
      </div>
      <div class="param-row">
        <span class="pk">{{ $t('realtime.coupling') }}</span>
        <span class="pv mono">DC</span>
      </div>
      <div class="param-row">
        <span class="pk">{{ $t('realtime.mode') }}</span>
        <span class="pv mono text-green">{{ $t('realtime.modeCont') }}</span>
      </div>
    </div>

    <!-- Analog channel list -->
    <div class="section-head">{{ $t('realtime.analogSection') }}</div>
    <div class="ch-list">
      <div v-for="ch in analogChs" :key="ch.id" class="ch-pill" :style="{ borderColor: ch.hex }">
        <span class="pill-dot" :style="{ background: ch.hex, boxShadow: `0 0 5px ${ch.hex}` }" />
        <span class="pill-id mono">{{ ch.id }}</span>
        <span class="pill-val mono" :style="{ color: ch.hex }">{{ valOf(ch.id) }}</span>
        <span class="pill-unit text-dim">{{ ch.unit }}</span>
      </div>
    </div>

    <!-- Dedicated channel list -->
    <div class="section-head">{{ $t('realtime.dedicatedSection') }}</div>
    <div class="ch-list">
      <div v-for="ch in dedicatedChs" :key="ch.id" class="ch-pill" :style="{ borderColor: ch.hex }">
        <span class="pill-dot" :style="{ background: ch.hex, boxShadow: `0 0 5px ${ch.hex}` }" />
        <span class="pill-id mono">{{ ch.id }}</span>
        <span class="pill-val mono" :style="{ color: ch.hex }">{{ valOf(ch.id) }}</span>
        <span class="pill-unit text-dim">{{ ch.unit }}</span>
      </div>
    </div>

    <!-- Trigger settings -->
    <div class="section-head">{{ $t('realtime.triggerSection') }}</div>
    <div class="param-list">
      <div class="param-row">
        <span class="pk">{{ $t('realtime.trigType') }}</span>
        <span class="pv mono text-amber">EDGE ↑</span>
      </div>
      <div class="param-row">
        <span class="pk">{{ $t('realtime.trigLevel') }}</span>
        <span class="pv mono">200.0 bar</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useAcquisitionStore } from '@/stores/acquisition'
import { CHANNEL_DEFS } from '@/config/channels'
const acqStore = useAcquisitionStore()

const analogChs = CHANNEL_DEFS.filter((c) =>
  ['pressure', 'temperature', 'displacement'].includes(c.type),
)
const dedicatedChs = CHANNEL_DEFS.filter((c) =>
  ['flow', 'particle', 'rpm', 'vibration', 'acoustic'].includes(c.type),
)

function valOf(id: string): string {
  const v = acqStore.channelValues[id] ?? 0
  const ch = CHANNEL_DEFS.find((c) => c.id === id)
  if (!ch) return v.toFixed(1)
  if (ch.type === 'rpm') return Math.round(v).toString()
  if (ch.type === 'acoustic' || ch.type === 'temperature') return v.toFixed(1)
  return v.toFixed(0)
}
</script>

<style scoped>
.acq-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow-y: auto;
  overflow-x: hidden;
  background: var(--bg-0);
  border-right: 1px solid var(--border);
  padding-bottom: 8px;
}

.section-head {
  font-size: 9px;
  font-family: var(--font-mono);
  letter-spacing: 0.12em;
  color: var(--text-dim);
  padding: 8px 10px 4px;
  border-bottom: 1px dashed var(--border);
  text-transform: uppercase;
}

.param-list {
  padding: 4px 8px;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.param-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 10px;
}
.pk {
  color: var(--text-2);
}
.pv {
  font-size: 10.5px;
  color: var(--text-1);
}

.ch-list {
  padding: 3px 6px;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.ch-pill {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 2px 5px;
  border: 1px solid;
  border-radius: 2px;
  background: rgba(255, 255, 255, 0.02);
  font-size: 9.5px;
}
.pill-dot {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  flex-shrink: 0;
}
.pill-id {
  color: var(--text-2);
  min-width: 30px;
  font-size: 9px;
  letter-spacing: 0.06em;
}
.pill-val {
  font-size: 10px;
  flex: 1;
  text-align: right;
}
.pill-unit {
  font-size: 8.5px;
  min-width: 22px;
  text-align: right;
}
</style>
