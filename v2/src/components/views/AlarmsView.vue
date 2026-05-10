<template>
  <div class="alarms-view">
    <AlarmRuleEditor />

    <main class="center">
      <div class="stats-panel">
        <AlarmTimeline />
        <AlarmStatsChart />
      </div>
      <AlarmEventLog />
    </main>
  </div>
</template>

<script setup lang="ts">
import AlarmRuleEditor from '@/components/alarms/AlarmRuleEditor.vue'
import AlarmTimeline from '@/components/alarms/AlarmTimeline.vue'
import AlarmStatsChart from '@/components/alarms/AlarmStatsChart.vue'
import AlarmEventLog from '@/components/alarms/AlarmEventLog.vue'
</script>

<style scoped>
.alarms-view {
  display: grid;
  grid-template-columns: 280px 1fr;
  height: 100%;
  overflow: hidden;
}
.center {
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.stats-panel {
  display: grid;
  grid-template-columns: 1fr 280px;
  gap: 8px;
  padding: 8px 12px;
  border-bottom: 1px solid var(--border);
  background: var(--bg-1);
  flex-shrink: 0;
}
</style>
