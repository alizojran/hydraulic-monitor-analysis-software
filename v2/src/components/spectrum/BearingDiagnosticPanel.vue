<template>
  <div class="bd-panel">
    <BearingParamEditor />
    <FaultAnalysisPanel />
  </div>
</template>

<script setup lang="ts">
import { watchEffect } from 'vue'
import { useDspStore } from '@/stores/dsp'
import { useAcquisitionStore } from '@/stores/acquisition'
import BearingParamEditor from './BearingParamEditor.vue'
import FaultAnalysisPanel from './FaultAnalysisPanel.vue'

const dspStore = useDspStore()
const acqStore = useAcquisitionStore()

watchEffect(() => {
  const rpm = acqStore.channelValues['V01'] ?? 1500
  dspStore.setBearingShaftRpm(rpm)
})
</script>

<style scoped>
.bd-panel {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 8px;
  font-size: 11px;
  border-top: 1px solid var(--border);
}
</style>
