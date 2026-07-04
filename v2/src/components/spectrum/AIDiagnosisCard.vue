<template>
  <div class="aic" :class="{ collapsed: !expanded }">
    <div class="aic-head" @click="expanded = !expanded">
      <span class="aic-caret">{{ expanded ? '▾' : '▸' }}</span>
      <span class="aic-title mono">{{ $t('spectrum.aiAnalysis.title') }}</span>
      <span v-if="latestEvent && aiResult" class="sev-badge" :class="`sev-${aiResult.severity}`">
        {{ aiResult.severity.toUpperCase() }}
      </span>
      <button v-if="expanded" class="run-btn" :disabled="isRunning" @click.stop="onRun">
        {{ isRunning ? '…' : '🤖 ' + $t('spectrum.aiAnalysis.reanalyze') }}
      </button>
    </div>

    <div v-if="expanded" class="aic-body">
      <!-- No config state -->
      <div v-if="!profile.aiConfig.enabled || !hasApiKey" class="hint dim">
        {{ $t('spectrum.aiAnalysis.noConfig') }}
      </div>

      <!-- Streaming state -->
      <div v-else-if="isRunning" class="streaming">
        <div class="spinner" />
        <pre class="stream-text">{{ streamBuffer || $t('spectrum.aiAnalysis.starting') }}</pre>
      </div>

      <!-- Result state -->
      <template v-else-if="aiResult">
        <div class="result-head">
          <span class="fault-type mono">{{ aiResult.fault_type }}</span>
          <span class="conf-badge" :class="`conf-${aiResult.confidence}`">
            {{ $t(`spectrum.aiAnalysis.confidence.${aiResult.confidence}`) }}
          </span>
        </div>

        <div v-if="aiResult.stop_machine" class="stop-warn">
          ⚠️ {{ $t('spectrum.aiAnalysis.stopMachineWarning') }}
        </div>

        <p class="explanation">{{ aiResult.explanation }}</p>

        <div v-if="aiResult.evidence.length > 0" class="evidence-block">
          <div class="ev-label">{{ $t('spectrum.aiAnalysis.evidence') }}:</div>
          <ul>
            <li v-for="(ev, i) in aiResult.evidence" :key="i">{{ ev }}</li>
          </ul>
        </div>

        <div class="recommend">
          <span class="rec-label">{{ $t('spectrum.aiAnalysis.recommendation') }}:</span>
          {{ aiResult.recommendation }}
        </div>

        <div class="meta-row mono">
          <span>{{ aiResult.generatedAt.slice(0, 16).replace('T', ' ') }}</span>
          <span>· {{ aiResult.model }}</span>
          <span>· ${{ aiResult.costUsd.toFixed(4) }}</span>
          <span v-if="aiResult.recheck_interval_days !== null">
            · {{ $t('spectrum.aiAnalysis.recheckIn', { d: aiResult.recheck_interval_days }) }}
          </span>
        </div>
      </template>

      <!-- Empty state — has config but no data yet -->
      <div v-else class="hint dim">
        {{ $t('spectrum.aiAnalysis.waiting') }}
      </div>

      <!-- Error -->
      <div v-if="lastError" class="err-row">
        <span class="err-msg">{{ lastError }}</span>
        <button class="retry-btn" @click="onRun">{{ $t('spectrum.aiAnalysis.errorRetry') }}</button>
      </div>

      <!-- Phase 2 preview block (shown when stream contains prompt preview) -->
      <details v-if="lastError && streamBuffer" class="prompt-preview">
        <summary class="dim">{{ $t('spectrum.aiAnalysis.showPrompt') }}</summary>
        <pre>{{ streamBuffer }}</pre>
      </details>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { useDeviceProfileStore } from '@/stores/deviceProfile'
import { useDiagnosticLogStore } from '@/stores/diagnosticLog'
import { useAIDiagnosis } from '@/composables/useAIDiagnosis'

const profile = useDeviceProfileStore()
const log = useDiagnosticLogStore()
const { isRunning, streamBuffer, lastError, runDiagnosis } = useAIDiagnosis()

const expanded = ref(false)

const latestEvent = computed(() =>
  log.events.length > 0 ? log.events[log.events.length - 1] : null,
)
const aiResult = computed(() => latestEvent.value?.aiDiagnosis ?? null)

const hasApiKey = computed(() => !!profile.aiConfig.apiKeyEncrypted)

async function onRun() {
  await runDiagnosis('manual')
}
</script>

<style scoped>
.aic {
  padding: 8px 12px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  border-top: 1px solid var(--border);
}
.aic.collapsed {
  padding-bottom: 8px;
}
.aic-head {
  display: flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
  user-select: none;
}
.aic-caret {
  font-size: 10px;
  color: var(--text-2);
  width: 10px;
}
.aic-title {
  font-size: 10px;
  letter-spacing: 0.1em;
  color: var(--text-2);
  flex: 1;
}
.sev-badge {
  font-size: 9px;
  font-family: var(--font-mono);
  font-weight: 700;
  padding: 1px 6px;
  border-radius: 2px;
  letter-spacing: 0.06em;
}
.sev-critical {
  background: rgba(255, 51, 85, 0.15);
  color: var(--red);
  border: 1px solid rgba(255, 51, 85, 0.4);
}
.sev-warning {
  background: rgba(255, 136, 0, 0.15);
  color: #ff8800;
  border: 1px solid rgba(255, 136, 0, 0.4);
}
.sev-advisory {
  background: rgba(255, 170, 0, 0.12);
  color: var(--amber);
  border: 1px solid rgba(255, 170, 0, 0.4);
}
.sev-normal {
  background: rgba(0, 255, 149, 0.1);
  color: var(--green);
  border: 1px solid rgba(0, 255, 149, 0.3);
}
.run-btn {
  font-size: 10px;
  padding: 2px 8px;
  background: rgba(170, 90, 255, 0.1);
  border: 1px solid rgba(170, 90, 255, 0.4);
  color: #c89cff;
  border-radius: 3px;
  cursor: pointer;
  font-family: var(--font-mono);
}
.run-btn:hover {
  background: rgba(170, 90, 255, 0.18);
}
.run-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
.aic-body {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.hint {
  font-size: 11px;
  padding: 4px 0;
}
.dim {
  color: var(--text-2);
}
.streaming {
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 11px;
}
.spinner {
  width: 12px;
  height: 12px;
  border: 2px solid rgba(170, 90, 255, 0.2);
  border-top-color: #c89cff;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
.stream-text {
  font-size: 10px;
  color: var(--text-1);
  background: var(--bg-2);
  border: 1px solid var(--border);
  padding: 6px;
  border-radius: 3px;
  max-height: 180px;
  overflow-y: auto;
  white-space: pre-wrap;
  word-break: break-word;
  font-family: var(--font-mono);
}
.result-head {
  display: flex;
  gap: 8px;
  align-items: center;
}
.fault-type {
  font-size: 12px;
  color: var(--text-0);
  font-weight: 700;
}
.conf-badge {
  font-size: 9px;
  padding: 1px 5px;
  border-radius: 2px;
  letter-spacing: 0.05em;
}
.conf-high {
  background: rgba(0, 255, 149, 0.1);
  color: var(--green);
  border: 1px solid rgba(0, 255, 149, 0.3);
}
.conf-medium {
  background: rgba(0, 217, 255, 0.1);
  color: var(--cyan);
  border: 1px solid rgba(0, 217, 255, 0.3);
}
.conf-low {
  background: rgba(255, 170, 0, 0.1);
  color: var(--amber);
  border: 1px solid rgba(255, 170, 0, 0.3);
}
.stop-warn {
  font-size: 11px;
  font-weight: 600;
  background: rgba(255, 136, 0, 0.12);
  border: 1px solid rgba(255, 136, 0, 0.4);
  color: #ff8800;
  padding: 4px 8px;
  border-radius: 3px;
}
.explanation {
  font-size: 11px;
  color: var(--text-1);
  line-height: 1.5;
  margin: 0;
}
.evidence-block {
  font-size: 10px;
}
.evidence-block .ev-label {
  color: var(--text-2);
  margin-bottom: 2px;
}
.evidence-block ul {
  margin: 0;
  padding-left: 16px;
  color: var(--text-1);
  line-height: 1.4;
}
.recommend {
  font-size: 11px;
  color: var(--text-1);
  background: rgba(0, 217, 255, 0.04);
  border-left: 2px solid var(--cyan);
  padding: 4px 8px;
}
.rec-label {
  color: var(--cyan);
  font-weight: 600;
  margin-right: 4px;
}
.meta-row {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  font-size: 9px;
  color: var(--text-2);
  border-top: 1px dashed var(--border);
  padding-top: 4px;
  margin-top: 2px;
}
.err-row {
  display: flex;
  gap: 8px;
  align-items: center;
  background: rgba(255, 51, 85, 0.06);
  border: 1px solid rgba(255, 51, 85, 0.3);
  border-radius: 3px;
  padding: 4px 8px;
}
.err-msg {
  flex: 1;
  font-size: 11px;
  color: var(--red);
}
.retry-btn {
  font-size: 10px;
  padding: 2px 8px;
  background: transparent;
  border: 1px solid var(--red);
  color: var(--red);
  border-radius: 2px;
  cursor: pointer;
}
.prompt-preview {
  font-size: 10px;
}
.prompt-preview summary {
  cursor: pointer;
  padding: 2px 0;
}
.prompt-preview pre {
  background: var(--bg-2);
  border: 1px solid var(--border);
  padding: 6px;
  border-radius: 3px;
  font-size: 10px;
  max-height: 240px;
  overflow-y: auto;
  white-space: pre-wrap;
  word-break: break-word;
  color: var(--text-1);
  font-family: var(--font-mono);
}
.mono {
  font-family: var(--font-mono);
}
</style>
