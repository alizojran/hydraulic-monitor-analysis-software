<template>
  <div class="cfg-section">
    <div class="sec-title">{{ $t('config.deviceProfile.aiTitle') }}</div>

    <div class="warn-banner">⚠️ {{ $t('config.deviceProfile.apiKeyWarning') }}</div>

    <div class="cfg-grid">
      <div class="cfg-row">
        <label>{{ $t('config.deviceProfile.aiProvider') }}</label>
        <select v-model="profile.aiConfig.provider" disabled>
          <option value="anthropic">Anthropic Claude</option>
        </select>
      </div>

      <div class="cfg-row">
        <label>{{ $t('config.deviceProfile.apiKey') }}</label>
        <div class="key-input">
          <input
            v-model="apiKeyInput"
            :type="showKey ? 'text' : 'password'"
            placeholder="sk-ant-..."
            @blur="saveKey"
          />
          <button class="eye-btn" @click="showKey = !showKey">
            {{ showKey ? '🙈' : '👁' }}
          </button>
          <span v-if="keySaved" class="ok-badge">✓</span>
        </div>
      </div>

      <div class="cfg-row">
        <label>{{ $t('config.deviceProfile.aiModel') }}</label>
        <select v-model="profile.aiConfig.model">
          <option value="claude-opus-4-7">claude-opus-4-7</option>
          <option value="claude-sonnet-4-6">claude-sonnet-4-6</option>
          <option value="claude-haiku-4-5-20251001">claude-haiku-4-5</option>
        </select>
      </div>

      <div class="cfg-row">
        <label>{{ $t('config.deviceProfile.monthlyBudget') }}</label>
        <div class="budget-input">
          <input v-model.number="profile.aiConfig.monthlyBudgetUsd" type="number" min="0" />
          <span class="dim">USD</span>
        </div>
      </div>

      <div class="cfg-row">
        <label>{{ $t('config.deviceProfile.currentSpend') }}</label>
        <span class="mono spend-line">
          ${{ profile.aiConfig.currentMonthSpendUsd.toFixed(2) }} / ${{
            profile.aiConfig.monthlyBudgetUsd.toFixed(2)
          }}
          <span class="dim">({{ profile.aiConfig.spendResetMonth }})</span>
        </span>
      </div>

      <div class="cfg-row">
        <label>{{ $t('config.deviceProfile.enableAI') }}</label>
        <label class="toggle">
          <input v-model="profile.aiConfig.enabled" type="checkbox" />
          <span>{{ profile.aiConfig.enabled ? $t('common.on') : $t('common.off') }}</span>
        </label>
      </div>

      <div class="cfg-row">
        <label>{{ $t('config.deviceProfile.autoTrigger') }}</label>
        <label class="toggle">
          <input v-model="profile.aiConfig.autoTriggerOnHighAlarm" type="checkbox" />
          <span>{{
            profile.aiConfig.autoTriggerOnHighAlarm ? $t('common.on') : $t('common.off')
          }}</span>
        </label>
      </div>

      <div class="cfg-row">
        <label>{{ $t('config.deviceProfile.testConnection') }}</label>
        <div class="test-row">
          <button :disabled="testing" @click="onTest">
            {{ testing ? '…' : $t('config.deviceProfile.testConnection') }}
          </button>
          <span v-if="testResult === 'ok'" class="ok-badge">✓ OK</span>
          <span v-else-if="testResult === 'fail'" class="err-badge">✗ FAIL</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useDeviceProfileStore } from '@/stores/deviceProfile'
import { testConnection } from '@/composables/useAIDiagnosis'

const profile = useDeviceProfileStore()
const apiKeyInput = ref('')
const showKey = ref(false)
const keySaved = ref(false)
const testing = ref(false)
const testResult = ref<'ok' | 'fail' | null>(null)

onMounted(async () => {
  // Pre-populate the input only if a key already exists (showing mask).
  const existing = await profile.getApiKeyPlaintext()
  if (existing) apiKeyInput.value = existing
})

async function saveKey() {
  await profile.setApiKey(apiKeyInput.value)
  keySaved.value = true
  setTimeout(() => (keySaved.value = false), 1500)
}

async function onTest() {
  testing.value = true
  testResult.value = null
  const key = await profile.getApiKeyPlaintext()
  if (!key) {
    testResult.value = 'fail'
    testing.value = false
    return
  }
  const ok = await testConnection(key, profile.aiConfig.model)
  testResult.value = ok ? 'ok' : 'fail'
  testing.value = false
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
.warn-banner {
  font-size: 11px;
  color: var(--amber);
  background: rgba(255, 170, 0, 0.06);
  border: 1px solid rgba(255, 170, 0, 0.25);
  border-radius: 3px;
  padding: 6px 10px;
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
.cfg-row input,
.cfg-row select {
  font-size: 12px;
  padding: 3px 6px;
  height: 26px;
  background: var(--bg-2);
  border: 1px solid var(--border);
  color: var(--text-0);
  border-radius: 2px;
  font-family: inherit;
}
.cfg-row select {
  min-width: 200px;
}
.key-input,
.budget-input,
.test-row {
  display: flex;
  align-items: center;
  gap: 8px;
}
.key-input input {
  flex: 1;
  max-width: 360px;
}
.budget-input input {
  width: 100px;
}
.eye-btn {
  background: var(--bg-2);
  border: 1px solid var(--border);
  border-radius: 2px;
  padding: 0 6px;
  height: 26px;
  cursor: pointer;
}
.ok-badge {
  color: var(--green);
  font-size: 12px;
  font-weight: 700;
}
.err-badge {
  color: var(--red);
  font-size: 12px;
  font-weight: 700;
}
.toggle {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  color: var(--text-1);
  cursor: pointer;
}
.spend-line {
  font-size: 12px;
  color: var(--text-1);
}
.dim {
  color: var(--text-2);
  font-size: 11px;
}
.mono {
  font-family: var(--font-mono);
}
</style>
