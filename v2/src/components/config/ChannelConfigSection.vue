<template>
  <div>
    <div class="section-label">{{ $t('config.channels') }}</div>
    <table class="cfg-table">
      <thead>
        <tr>
          <th>{{ $t('config.ch.id') }}</th>
          <th>{{ $t('config.ch.name') }}</th>
          <th>{{ $t('config.ch.enabled') }}</th>
          <th>{{ $t('config.ch.coupling') }}</th>
          <th>{{ $t('config.ch.range') }}</th>
          <th>{{ $t('config.ch.unit') }}</th>
          <th>{{ $t('config.ch.filter') }}</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="ch in CHANNEL_DEFS" :key="ch.id">
          <td class="mono" :style="{ color: ch.hex }">{{ ch.id }}</td>
          <td>
            <input v-model="configStore.channels[ch.id].name" type="text" style="width: 140px" />
          </td>
          <td>
            <input
              type="checkbox"
              :checked="configStore.channels[ch.id].enabled"
              @change="
                configStore.updateChannel(ch.id, {
                  enabled: ($event.target as HTMLInputElement).checked,
                })
              "
            />
          </td>
          <td>
            <select
              :value="configStore.channels[ch.id].coupling"
              @change="
                configStore.updateChannel(ch.id, {
                  coupling: ($event.target as HTMLSelectElement).value as 'DC' | 'AC' | 'IEPE',
                })
              "
            >
              <option>DC</option>
              <option>AC</option>
              <option>IEPE</option>
            </select>
          </td>
          <td class="mono text-dim">{{ ch.min }} – {{ ch.max }}</td>
          <td class="mono text-dim">{{ ch.unit }}</td>
          <td>
            <input
              v-model="configStore.channels[ch.id].filter"
              type="text"
              style="width: 90px"
            />
          </td>
        </tr>
      </tbody>
    </table>
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
.cfg-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 11px;
}
.cfg-table th,
.cfg-table td {
  padding: 5px 8px;
  border: 1px solid var(--border);
  text-align: left;
  white-space: nowrap;
}
.cfg-table th {
  background: var(--bg-2);
  color: var(--text-2);
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.04em;
}
.cfg-table input[type='text'] {
  background: transparent;
  border: none;
  color: var(--text-1);
  font-family: inherit;
  font-size: 11px;
  outline: none;
}
.cfg-table select {
  font-size: 11px;
  padding: 1px 4px;
}
</style>
