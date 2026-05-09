<template>
  <div class="peak-list">
    <div class="list-title text-dim">{{ $t('spectrum.topPeaks') }}</div>
    <div v-if="!peaks.length" class="empty text-dim">—</div>
    <table v-else>
      <thead>
        <tr>
          <th>#</th>
          <th>{{ $t('units.hz') }}</th>
          <th>dB</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="(p, i) in peaks" :key="i">
          <td class="text-dim mono">{{ i + 1 }}</td>
          <td class="mono text-cyan">{{ p.frequency.toFixed(1) }}</td>
          <td class="mono text-green">{{ p.amplitudeDb.toFixed(1) }}</td>
        </tr>
      </tbody>
    </table>

    <div class="thd-row" v-if="res">
      <span class="text-dim">THD</span>
      <span class="mono text-1">{{ (res.thd * 100).toFixed(2) }} %</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useDspStore } from '@/stores/dsp'

const dspStore = useDspStore()
const res = computed(() => dspStore.fftResult)
const peaks = computed(() => res.value?.peaks ?? [])
</script>

<style scoped>
.peak-list { padding: 8px; font-size: 11px; }
.list-title { font-size: 10px; letter-spacing: 0.08em; text-transform: uppercase; margin-bottom: 6px; }
.empty { padding: 8px 0; }
table { width: 100%; border-collapse: collapse; }
th { text-align: left; color: var(--text-2); font-weight: 500; padding: 2px 4px; font-size: 10px; }
td { padding: 3px 4px; border-top: 1px solid var(--border); }
.thd-row { display: flex; justify-content: space-between; padding: 6px 4px 0; border-top: 1px solid var(--border); margin-top: 4px; }
</style>
