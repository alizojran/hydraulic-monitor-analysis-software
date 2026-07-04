<template>
  <div class="cfg-section">
    <div class="sec-title">{{ $t('config.deviceProfile.baselineTitle') }}</div>

    <div class="hint-banner">💡 {{ $t('config.deviceProfile.baselineNoBuildHint') }}</div>

    <div class="current-cond">
      <span class="cc-label">{{ $t('config.deviceProfile.currentCondition') }}:</span>
      <span class="cc-value mono">{{ currentConditionDisplay }}</span>
    </div>

    <table class="baseline-table">
      <thead>
        <tr>
          <th>{{ $t('config.deviceProfile.condition') }}</th>
          <th>{{ $t('config.deviceProfile.capturedAt') }}</th>
          <th>RMS (g)</th>
          <th>CF</th>
          <th>BPFI (dB)</th>
          <th>BPFO (dB)</th>
          <th>{{ $t('config.deviceProfile.actions') }}</th>
        </tr>
      </thead>
      <tbody>
        <tr
          v-for="key in profile.CONDITION_KEYS"
          :key="key"
          :class="{ active: key === currentKey }"
        >
          <td class="mono">{{ key }}</td>
          <template v-if="profile.baselines[key]">
            <td class="mono">
              {{ profile.baselines[key]?.capturedAt.slice(0, 10) }}
              <span
                v-if="isStale(key)"
                class="stale-warn"
                :title="$t('config.deviceProfile.baselineStaleWarning')"
                >⚠</span
              >
            </td>
            <td class="mono">{{ profile.baselines[key]?.rmsG.toFixed(3) }}</td>
            <td class="mono">{{ profile.baselines[key]?.crestFactor.toFixed(2) }}</td>
            <td class="mono">{{ profile.baselines[key]?.bpfiAmplitudeDb.toFixed(1) }}</td>
            <td class="mono">{{ profile.baselines[key]?.bpfoAmplitudeDb.toFixed(1) }}</td>
            <td class="actions">
              <button class="cap-btn" :disabled="profile.captureInProgress" @click="capture(key)">
                {{ captureBtnLabel(key) }}
              </button>
              <button class="x-btn" @click="profile.deleteBaseline(key)">×</button>
            </td>
          </template>
          <template v-else>
            <td class="dim">—</td>
            <td class="dim">—</td>
            <td class="dim">—</td>
            <td class="dim">—</td>
            <td class="dim">—</td>
            <td class="actions">
              <button class="cap-btn" :disabled="profile.captureInProgress" @click="capture(key)">
                {{ captureBtnLabel(key) }}
              </button>
            </td>
          </template>
        </tr>
      </tbody>
    </table>

    <div v-if="profile.captureInProgress" class="capture-bar">
      <div class="cb-fill" :style="{ width: profile.captureProgress + '%' }" />
      <span class="cb-label mono">
        {{ $t('config.deviceProfile.baselineCapturing') }}
        {{ profile.captureCondition }} · {{ profile.captureProgress }}%
      </span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useDeviceProfileStore } from '@/stores/deviceProfile'
import type { ConditionKey } from '@/types/deviceProfile'

const { t } = useI18n()
const profile = useDeviceProfileStore()

const currentKey = computed(() => profile.getCurrentConditionKey())
const currentConditionDisplay = computed(
  () => currentKey.value ?? t('config.deviceProfile.conditionUnknown'),
)

const STALE_DAYS = 730

function isStale(key: ConditionKey): boolean {
  const b = profile.baselines[key]
  if (!b) return false
  const ageDays = (Date.now() - new Date(b.capturedAt).getTime()) / 86_400_000
  return ageDays > STALE_DAYS
}

function captureBtnLabel(key: ConditionKey): string {
  if (profile.captureInProgress && profile.captureCondition === key) {
    return t('config.deviceProfile.baselineCapturing')
  }
  return profile.baselines[key]
    ? t('config.deviceProfile.baselineRebuildBtn')
    : t('config.deviceProfile.baselineCaptureBtn')
}

async function capture(key: ConditionKey) {
  if (profile.captureInProgress) return
  await profile.startBaselineCapture(key)
}
</script>

<style scoped>
.cfg-section {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.sec-title {
  font-size: 10px;
  color: var(--text-2);
  letter-spacing: 0.1em;
  text-transform: uppercase;
  padding-bottom: 6px;
  border-bottom: 1px solid var(--border);
}
.hint-banner {
  font-size: 11px;
  color: var(--text-1);
  background: rgba(0, 217, 255, 0.06);
  border: 1px solid rgba(0, 217, 255, 0.2);
  border-radius: 3px;
  padding: 6px 10px;
}
.current-cond {
  display: flex;
  gap: 8px;
  align-items: baseline;
  font-size: 11px;
}
.cc-label {
  color: var(--text-2);
}
.cc-value {
  color: var(--cyan);
  font-weight: 600;
}
.baseline-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 11px;
}
.baseline-table th {
  text-align: left;
  padding: 4px 8px;
  font-size: 10px;
  letter-spacing: 0.05em;
  font-weight: 500;
  color: var(--text-2);
  border-bottom: 1px solid var(--border);
}
.baseline-table td {
  padding: 4px 8px;
  border-bottom: 1px solid var(--border);
}
.baseline-table tr.active {
  background: rgba(0, 217, 255, 0.05);
}
.dim {
  color: var(--text-2);
}
.mono {
  font-family: var(--font-mono);
}
.stale-warn {
  color: var(--amber);
  margin-left: 4px;
  cursor: help;
}
.actions {
  display: flex;
  gap: 4px;
}
.cap-btn {
  font-size: 10px;
  padding: 2px 8px;
  background: rgba(0, 217, 255, 0.08);
  border: 1px solid rgba(0, 217, 255, 0.3);
  border-radius: 2px;
  color: var(--cyan);
}
.cap-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
.x-btn {
  font-size: 12px;
  padding: 0 6px;
  background: transparent;
  border: 1px solid var(--border);
  color: var(--text-2);
  border-radius: 2px;
}
.x-btn:hover {
  color: var(--red);
  border-color: var(--red);
}
.capture-bar {
  position: relative;
  height: 24px;
  background: var(--bg-2);
  border: 1px solid var(--border);
  border-radius: 3px;
  overflow: hidden;
}
.cb-fill {
  position: absolute;
  inset: 0 auto 0 0;
  background: linear-gradient(to right, rgba(0, 217, 255, 0.2), rgba(0, 217, 255, 0.5));
  transition: width 0.2s linear;
}
.cb-label {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  color: var(--cyan);
}
</style>
