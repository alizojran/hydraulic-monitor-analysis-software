<template>
  <div class="realtime-view">
    <!-- Left sidebar -->
    <aside class="sidebar">
      <div class="section-title">{{ $t('realtime.flow') }}</div>
      <FlowCard />
      <div class="section-title" style="margin-top:8px">{{ $t('realtime.vibration') }}</div>
      <RpmCard />
      <VibrationCard />
    </aside>

    <!-- Center: 4x2 analog grid -->
    <main class="center">
      <div class="section-title">{{ $t('realtime.analog') }}</div>
      <div class="analog-grid">
        <AnalogChannelCard v-for="ch in ANALOG_CHANNELS" :key="ch.id" :channelId="ch.id" />
      </div>
      <div class="section-title" style="margin-top:8px">{{ $t('realtime.acoustic') }}</div>
      <div class="acoustic-wrap">
        <AcousticCard />
      </div>
    </main>

    <!-- Right sidebar: KPI + alarms -->
    <aside class="right">
      <KpiPanel />
    </aside>
  </div>
</template>

<script setup lang="ts">
import { ANALOG_CHANNELS } from '@/config/channels'
import AnalogChannelCard from '@/components/realtime/AnalogChannelCard.vue'
import FlowCard from '@/components/realtime/FlowCard.vue'
import RpmCard from '@/components/realtime/RpmCard.vue'
import VibrationCard from '@/components/realtime/VibrationCard.vue'
import AcousticCard from '@/components/realtime/AcousticCard.vue'
import KpiPanel from '@/components/realtime/KpiPanel.vue'
</script>

<style scoped>
.realtime-view {
  display: grid;
  grid-template-columns: var(--sidebar-w) 1fr var(--right-w);
  gap: 8px;
  height: 100%;
  overflow: hidden;
  padding: 8px;
}
.sidebar { display: flex; flex-direction: column; gap: 6px; overflow-y: auto; }
.center  { display: flex; flex-direction: column; gap: 6px; overflow-y: auto; }
.right   { display: flex; flex-direction: column; overflow-y: auto; }

.section-title {
  font-size: 10px; color: var(--text-2); letter-spacing: 0.1em;
  text-transform: uppercase; padding: 2px 0;
}

.analog-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 6px;
  flex: 1;
}
.acoustic-wrap { min-height: 220px; flex-shrink: 0; }
</style>
