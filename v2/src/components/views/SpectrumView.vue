<template>
  <div class="spectrum-view">
    <div class="left">
      <PeakList />
      <div class="divider" />
      <BearingDiagnosticPanel />
      <div class="divider" />
      <FaultSummaryPanel />
      <div class="divider" />
      <OctaveBandChart />
    </div>
    <main class="center">
      <SpectrumMain />
      <div class="waterfall-area">
        <WaterfallChart />
      </div>
    </main>
  </div>
</template>

<script setup lang="ts">
import SpectrumMain from '@/components/spectrum/SpectrumMain.vue'
import WaterfallChart from '@/components/spectrum/WaterfallChart.vue'
import OctaveBandChart from '@/components/spectrum/OctaveBandChart.vue'
import PeakList from '@/components/spectrum/PeakList.vue'
import BearingDiagnosticPanel from '@/components/spectrum/BearingDiagnosticPanel.vue'
import FaultSummaryPanel from '@/components/spectrum/FaultSummaryPanel.vue'
</script>

<style scoped>
.spectrum-view {
  display: grid;
  grid-template-columns: 200px 1fr;
  height: 100%;
  overflow: hidden;
  gap: 0;
}
.left {
  display: flex; flex-direction: column;
  border-right: 1px solid var(--border);
  overflow-y: auto;
}
.left > :deep(*):first-child { flex: 0 0 auto; }
.divider { height: 1px; background: var(--border); }
.left > :deep(*):last-child { flex: 1; min-height: 120px; }
.center {
  display: flex; flex-direction: column;
}
.waterfall-area { height: 180px; border-top: 1px solid var(--border); flex-shrink: 0; }
</style>
