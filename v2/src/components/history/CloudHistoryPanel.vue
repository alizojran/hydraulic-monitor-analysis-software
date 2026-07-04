<template>
  <section class="cloud-history">
    <div class="panel-head">
      <div>
        <div class="title">{{ $t('history.cloudHistory') }}</div>
        <div class="sub mono text-dim">{{ cloud.baseUrl }} · {{ cloud.deviceId }}</div>
      </div>
      <button class="query-btn" :disabled="loading" @click="query">
        {{ loading ? $t('status.loading') : $t('history.query') }}
      </button>
    </div>

    <div class="filters">
      <label>
        <span>{{ $t('spectrum.channel') }}</span>
        <select v-model="channelId">
          <option value="">ALL</option>
          <option value="V02">V02</option>
          <option value="S01">S01</option>
        </select>
      </label>
      <label>
        <span>{{ $t('history.start') }}</span>
        <input v-model="fromLocal" type="datetime-local" />
      </label>
      <label>
        <span>{{ $t('history.end') }}</span>
        <input v-model="toLocal" type="datetime-local" />
      </label>
      <label>
        <span>Limit</span>
        <input v-model.number="limit" type="number" min="1" max="2000" />
      </label>
    </div>

    <div v-if="error" class="err">{{ error }}</div>
    <div v-else-if="!rows.length" class="empty text-dim">{{ $t('history.noCloudRows') }}</div>
    <table v-else>
      <thead>
        <tr>
          <th>{{ $t('alarms.time') }}</th>
          <th>CH</th>
          <th>RMS</th>
          <th>Peak</th>
          <th>Main Hz</th>
          <th>dB</th>
          <th>Seq</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="row in rows" :key="`${row.channelId}-${row.ts}-${row.seq ?? ''}`">
          <td class="mono">{{ formatDate(row.ts) }}</td>
          <td class="mono text-cyan">{{ row.channelId }}</td>
          <td class="mono">{{ fmt(row.rms) }}</td>
          <td class="mono">{{ fmt(row.peak ?? row.peakValue) }}</td>
          <td class="mono">{{ fmt(row.mainFreq, 1) }}</td>
          <td class="mono">{{ fmt(row.mainAmpDb, 1) }}</td>
          <td class="mono text-dim">{{ row.seq ?? '—' }}</td>
        </tr>
      </tbody>
    </table>
  </section>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useCloudStore } from '@/stores/cloud'
import { useLang } from '@/composables/useLang'
import type { CloudFftMessage } from '@/types/cloud'

const cloud = useCloudStore()
const { lng } = useLang()
const channelId = ref('V02')
const limit = ref(200)
const fromLocal = ref('')
const toLocal = ref('')
const rows = ref<CloudFftMessage[]>([])
const loading = ref(false)
const error = ref('')

function localToIso(value: string): string | undefined {
  if (!value) return undefined
  const t = new Date(value).toISOString()
  return t
}

async function query() {
  loading.value = true
  error.value = ''
  try {
    const res = await cloud.fetchHistory({
      channelId: channelId.value || undefined,
      from: localToIso(fromLocal.value),
      to: localToIso(toLocal.value),
      limit: limit.value,
    })
    rows.value = res.rows
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err)
  } finally {
    loading.value = false
  }
}

function formatDate(ts: number | string) {
  return new Date(ts).toLocaleString(lng('zh-CN', 'en-US'), { hour12: false })
}

function fmt(v: unknown, digits = 3) {
  return typeof v === 'number' && Number.isFinite(v) ? v.toFixed(digits) : '—'
}
</script>

<style scoped>
.cloud-history {
  border: 1px solid var(--border);
  background: var(--bg-1);
  border-radius: var(--r);
  padding: 12px;
}
.panel-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 10px;
}
.title {
  color: var(--text-0);
  font-size: 13px;
  font-weight: 700;
}
.sub {
  font-size: 10px;
}
.filters {
  display: grid;
  grid-template-columns: 100px 1fr 1fr 90px;
  gap: 8px;
  align-items: end;
  margin-bottom: 10px;
}
label {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 10px;
  color: var(--text-2);
}
select,
input {
  background: var(--bg-2);
  border: 1px solid var(--border-2);
  color: var(--text-0);
  padding: 5px 7px;
  border-radius: var(--r);
  font-size: 11px;
}
.query-btn {
  padding: 5px 12px;
  font-size: 11px;
  background: rgba(0, 217, 255, 0.1);
  border: 1px solid rgba(0, 217, 255, 0.35);
  color: var(--cyan);
  border-radius: var(--r);
}
table {
  width: 100%;
  border-collapse: collapse;
  font-size: 11px;
}
th,
td {
  border-top: 1px solid var(--border);
  padding: 5px 6px;
  text-align: left;
}
th {
  color: var(--text-2);
  font-weight: 600;
  background: var(--bg-2);
}
.empty,
.err {
  padding: 12px 0;
  font-size: 11px;
}
.err {
  color: var(--red);
}
@media (max-width: 900px) {
  .filters {
    grid-template-columns: 1fr 1fr;
  }
}
</style>
