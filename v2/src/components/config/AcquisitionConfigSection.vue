<template>
  <div>
    <div class="section-label">{{ $t('config.acquisition') }}</div>
    <div class="acq-grid">
      <div class="acq-item">
        <label>{{ $t('config.acq.sampleRate') }}</label>
        <select
          :value="configStore.acquisition.sampleRate"
          @change="
            configStore.updateAcq({
              sampleRate: parseInt(($event.target as HTMLSelectElement).value),
            })
          "
        >
          <option v-for="r in [100, 1000, 5000, 10000, 25000, 50000, 100000]" :key="r" :value="r">
            {{ r.toLocaleString() }} Hz
          </option>
        </select>
      </div>
      <div class="acq-item">
        <label>{{ $t('config.acq.trigger') }}</label>
        <select
          :value="configStore.acquisition.triggerType"
          @change="
            configStore.updateAcq({
              triggerType: ($event.target as HTMLSelectElement).value as
                | 'edge-rising'
                | 'edge-falling'
                | 'window'
                | 'software',
            })
          "
        >
          <option value="software">Software</option>
          <option value="edge-rising">Edge Rising</option>
          <option value="edge-falling">Edge Falling</option>
          <option value="window">Window</option>
        </select>
      </div>
      <div class="acq-item">
        <label>{{ $t('config.acq.preTrigger') }}</label>
        <input
          type="number"
          :value="configStore.acquisition.preTriggerPct"
          min="0"
          max="99"
          @change="
            configStore.updateAcq({
              preTriggerPct: parseInt(($event.target as HTMLInputElement).value),
            })
          "
        />
        <span class="text-dim">%</span>
      </div>
      <div class="acq-item">
        <label>{{ $t('config.acq.postTrigger') }}</label>
        <input
          type="number"
          :value="configStore.acquisition.postTriggerPct"
          min="1"
          max="100"
          @change="
            configStore.updateAcq({
              postTriggerPct: parseInt(($event.target as HTMLInputElement).value),
            })
          "
        />
        <span class="text-dim">%</span>
      </div>
      <div class="acq-item">
        <label>{{ $t('config.acq.trigger') }} Ch</label>
        <select
          :value="configStore.acquisition.triggerChannel"
          @change="
            configStore.updateAcq({
              triggerChannel: ($event.target as HTMLSelectElement).value,
            })
          "
        >
          <option v-for="ch in CHANNEL_DEFS" :key="ch.id" :value="ch.id">{{ ch.id }}</option>
        </select>
      </div>
      <div class="acq-item">
        <label>Trigger Level</label>
        <input
          type="number"
          :value="configStore.acquisition.triggerLevel"
          @change="
            configStore.updateAcq({
              triggerLevel: parseFloat(($event.target as HTMLInputElement).value),
            })
          "
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useConfigStore } from '@/stores/config'
import { CHANNEL_DEFS } from '@/config/channels'

const configStore = useConfigStore()
</script>

<style scoped>
.section-label {
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--text-2);
  margin-bottom: 8px;
}
.acq-grid {
  display: flex;
  flex-direction: column;
  gap: 12px;
  max-width: 400px;
}
.acq-item {
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 12px;
}
.acq-item label {
  min-width: 130px;
  color: var(--text-2);
  font-size: 11px;
}
.acq-item select,
.acq-item input[type='number'] {
  font-size: 12px;
  padding: 3px 6px;
  height: 26px;
}
</style>
