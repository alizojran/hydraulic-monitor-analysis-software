<template>
  <div class="realtime-view">
    <!-- Left: acquisition params + channel list -->
    <aside class="left-sidebar">
      <AcqParamsPanel />
    </aside>

    <!-- Center: all data cards -->
    <main class="center">
      <!-- Analog section -->
      <div class="section-bar">
        <span class="sb-title"
          >{{ $t('realtime.analogInputs') }} <span class="sb-dot">·</span> ANALOG INPUTS
        </span>
        <span class="sb-meta mono"
          >CH01–CH08 · 24-bit · {{ $t('status.window') }}
          {{ localLabel(currentWindow) }}
        </span>
      </div>
      <div class="analog-grid">
        <AnalogChannelCard v-for="ch in ANALOG_CHANNELS" :key="ch.id" :channel-id="ch.id" />
      </div>

      <!-- Flow / vibration section -->
      <div class="section-bar">
        <span class="sb-title">{{ $t('realtime.flowVibChannels') }}</span>
        <span class="sb-meta mono"
          >FLOW-2 · VIB-2 · {{ $t('status.window') }}
          {{ localLabel(currentWindow) }}
        </span>
      </div>
      <div class="special-grid">
        <FlowCard />
        <ParticleCard />
        <RpmCard />
        <VibrationCard />
      </div>

      <!-- Acoustic section -->
      <div class="section-bar">
        <span class="sb-title"
          >{{ $t('realtime.acousticChannel') }} <span class="sb-dot">·</span> ACOUSTIC
        </span>
        <span class="sb-meta mono"
          >S01 · {{ $t('realtime.mic') }} · 20 Hz – 20 kHz · A {{ $t('realtime.weighted') }}</span
        >
      </div>
      <div class="acoustic-wrap">
        <AcousticCard />
      </div>
    </main>

    <!-- Right: KPI + alarms + storage + event log -->
    <aside class="right">
      <KpiPanel />
    </aside>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useAcquisitionStore } from '@/stores/acquisition'
import { useLocaleName } from '@/composables/useLocaleName'
import { ANALOG_CHANNELS, TIME_WINDOWS } from '@/config/channels'
import AcqParamsPanel from '@/components/realtime/AcqParamsPanel.vue'
import AnalogChannelCard from '@/components/realtime/AnalogChannelCard.vue'
import FlowCard from '@/components/realtime/FlowCard.vue'
import ParticleCard from '@/components/realtime/ParticleCard.vue'
import RpmCard from '@/components/realtime/RpmCard.vue'
import VibrationCard from '@/components/realtime/VibrationCard.vue'
import AcousticCard from '@/components/realtime/AcousticCard.vue'
import KpiPanel from '@/components/realtime/KpiPanel.vue'

useI18n()
const { localLabel } = useLocaleName()
const acqStore = useAcquisitionStore()
const currentWindow = computed(
  () => TIME_WINDOWS.find((w) => w.value === acqStore.timeWindowSec) ?? TIME_WINDOWS[1],
)
</script>

<style scoped>
.realtime-view {
  display: grid;
  grid-template-columns: var(--sidebar-w) 1fr var(--right-w);
  height: 100%;
  overflow: hidden;
}

.left-sidebar {
  border-right: 1px solid var(--border);
  overflow-y: auto;
  overflow-x: hidden;
  background: var(--bg-0);
}
.center {
  display: grid;
  grid-template-rows: auto minmax(0, 1.3fr) auto minmax(0, 1.15fr) auto minmax(0, 0.95fr);
  overflow: hidden;
}
.right {
  border-left: 1px solid var(--border);
  overflow-y: auto;
}

/* Section bar: V1-style bold header with dashed outline */
.section-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 4px 12px;
  background: linear-gradient(180deg, var(--bg-1) 0%, var(--bg-0) 100%);
  border-top: 1px solid var(--border);
  border-bottom: 1px dashed var(--border-2);
}
.section-bar:first-child {
  border-top: none;
}
.sb-title {
  font-size: 11px;
  font-weight: 600;
  color: var(--text-0);
  letter-spacing: 0.04em;
}
.sb-dot {
  color: var(--cyan);
  margin: 0 4px;
}
.sb-meta {
  font-size: 10px;
  color: var(--text-2);
  letter-spacing: 0.04em;
}

.analog-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  grid-template-rows: 1fr 1fr;
  gap: 5px;
  padding: 5px 6px;
  min-height: 0;
}

.special-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 5px;
  padding: 5px 6px;
  min-height: 0;
}

.acoustic-wrap {
  padding: 5px 6px;
  min-height: 0;
  display: flex;
  flex-direction: column;
}
.acoustic-wrap > * {
  flex: 1;
  min-height: 0;
}
</style>
