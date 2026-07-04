<template>
  <div class="cfg-section">
    <div class="sec-title">{{ $t('config.system.title') }}</div>

    <div class="cfg-grid">
      <!-- Language -->
      <div class="cfg-row">
        <label>{{ $t('config.system.language') }}</label>
        <div class="toggle-group">
          <button :class="{ active: locale !== 'en' }" @click="setLocale('zh')">中文</button>
          <button :class="{ active: locale === 'en' }" @click="setLocale('en')">English</button>
        </div>
      </div>

      <!-- Default time window -->
      <div class="cfg-row">
        <label>{{ $t('config.system.timeWindow') }}</label>
        <select
          :value="acq.timeWindowSec"
          @change="acq.setTimeWindow(parseInt(($event.target as HTMLSelectElement).value))"
        >
          <option v-for="w in TIME_WINDOWS" :key="w.value" :value="w.value">
            {{ localLabel(w) }}
          </option>
        </select>
      </div>

      <!-- Storage info -->
      <div class="cfg-row">
        <label>{{ $t('config.system.storage') }}</label>
        <div class="storage-info">
          <span class="mono">{{ storageKb }} KB</span>
          <button class="danger-sm" @click="clearStorage">
            {{ $t('config.system.clearStorage') }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useAcquisitionStore } from '@/stores/acquisition'
import { useLocaleName } from '@/composables/useLocaleName'
import { TIME_WINDOWS } from '@/config/channels'

const { locale } = useI18n()
const { localLabel } = useLocaleName()
const acq = useAcquisitionStore()

function setLocale(lang: string) {
  locale.value = lang as 'zh' | 'en'
  localStorage.setItem('daq-locale', lang)
}

const storageKb = computed(() => {
  let total = 0
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i) ?? ''
    if (key.startsWith('daq-')) {
      total += (localStorage.getItem(key) ?? '').length
    }
  }
  return Math.round((total / 1024) * 10) / 10
})

function clearStorage() {
  const keys: string[] = []
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)
    if (key?.startsWith('daq-')) keys.push(key)
  }
  keys.forEach((k) => localStorage.removeItem(k))
  window.location.reload()
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
.cfg-grid {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.cfg-row {
  display: grid;
  grid-template-columns: 160px 1fr;
  align-items: center;
  gap: 12px;
  font-size: 12px;
  padding: 4px 0;
}
.cfg-row label {
  color: var(--text-2);
  font-size: 11px;
}
.cfg-row select {
  font-size: 12px;
  padding: 3px 6px;
  height: 26px;
  min-width: 120px;
  max-width: 180px;
}
.toggle-group {
  display: flex;
  gap: 3px;
}
.toggle-group button {
  padding: 2px 10px;
  font-size: 11px;
  background: var(--bg-2);
  border: 1px solid var(--border);
  border-radius: 2px;
  color: var(--text-2);
}
.toggle-group button.active {
  background: rgba(0, 217, 255, 0.12);
  border-color: var(--cyan);
  color: var(--cyan);
}
.storage-info {
  display: flex;
  align-items: center;
  gap: 10px;
}
.mono {
  font-family: var(--font-mono);
  font-size: 12px;
  color: var(--text-1);
}
.danger-sm {
  font-size: 11px;
  padding: 2px 10px;
  background: rgba(255, 51, 85, 0.08);
  border: 1px solid rgba(255, 51, 85, 0.35);
  border-radius: 2px;
  color: var(--red);
}
.danger-sm:hover {
  background: rgba(255, 51, 85, 0.15);
}
</style>
