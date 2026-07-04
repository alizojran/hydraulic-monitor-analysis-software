<template>
  <Teleport to="body">
    <div v-if="modelValue" class="modal-mask" @click.self="close">
      <div class="modal-card">
        <div class="modal-head">
          <span>{{ $t('diagnosticLog.feedbackTitle') }}</span>
          <button class="close-x" @click="close">×</button>
        </div>

        <div class="modal-body">
          <div class="row">
            <label>{{ $t('diagnosticLog.inspectionDate') }}</label>
            <input v-model="form.inspectionDate" type="date" />
          </div>

          <div class="row">
            <label>{{ $t('diagnosticLog.actualFinding') }}</label>
            <textarea v-model="form.actualFinding" rows="2" />
          </div>

          <div class="row">
            <label>{{ $t('diagnosticLog.aiAccuracy') }}</label>
            <div class="radio-group">
              <label v-for="opt in ['correct', 'incorrect', 'unchecked'] as const" :key="opt">
                <input v-model="form.diagnosisAccuracy" type="radio" :value="opt" />
                {{ $t(`diagnosticLog.accuracy.${opt}`) }}
              </label>
            </div>
          </div>

          <div class="row">
            <label>{{ $t('diagnosticLog.actionTaken') }}</label>
            <div class="checkbox-group">
              <label
                v-for="key in ['replaceBearing', 'monitor', 'replaceSeal', 'other'] as const"
                :key="key"
              >
                <input
                  type="checkbox"
                  :checked="form.actionTaken.includes(key)"
                  @change="toggleAction(key)"
                />
                {{ $t(`diagnosticLog.actions.${key}`) }}
              </label>
            </div>
          </div>

          <div class="row">
            <label>{{ $t('diagnosticLog.partsReplaced') }}</label>
            <input v-model="form.partsReplaced" type="text" />
          </div>

          <div class="row">
            <label>{{ $t('diagnosticLog.postActionRms') }}</label>
            <input v-model.number="postActionRmsInput" type="number" step="0.001" />
          </div>

          <div class="row">
            <label>{{ $t('diagnosticLog.updateBaseline') }}</label>
            <label class="cb-line">
              <input v-model="form.newBaselineEstablished" type="checkbox" />
              {{
                form.newBaselineEstablished
                  ? $t('diagnosticLog.baselineWillRebuild')
                  : $t('diagnosticLog.baselineNoRebuild')
              }}
            </label>
          </div>

          <div class="row">
            <label>{{ $t('diagnosticLog.feedbackNotes') }}</label>
            <textarea v-model="form.notes" rows="2" />
          </div>
        </div>

        <div class="modal-foot">
          <button @click="close">{{ $t('common.cancel') }}</button>
          <button class="primary" @click="onSave">
            {{ $t('diagnosticLog.saveFeedback') }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import { useDiagnosticLogStore } from '@/stores/diagnosticLog'
import { useDeviceProfileStore } from '@/stores/deviceProfile'
import type { DiagnosticOutcome } from '@/types/diagnostic'

const props = defineProps<{
  eventId: string | null
  modelValue: boolean
}>()
const emit = defineEmits<{
  'update:modelValue': [value: boolean]
}>()

const log = useDiagnosticLogStore()
const profile = useDeviceProfileStore()

interface FeedbackForm {
  inspectionDate: string
  actualFinding: string
  diagnosisAccuracy: DiagnosticOutcome['diagnosisAccuracy']
  actionTaken: string[]
  partsReplaced: string
  newBaselineEstablished: boolean
  notes: string
}

const today = new Date().toISOString().slice(0, 10)
const form = ref<FeedbackForm>({
  inspectionDate: today,
  actualFinding: '',
  diagnosisAccuracy: 'unchecked',
  actionTaken: [],
  partsReplaced: '',
  newBaselineEstablished: false,
  notes: '',
})
const postActionRmsInput = ref<number | null>(null)

watch(
  () => props.modelValue,
  (open) => {
    if (open) {
      form.value = {
        inspectionDate: today,
        actualFinding: '',
        diagnosisAccuracy: 'unchecked',
        actionTaken: [],
        partsReplaced: '',
        newBaselineEstablished: false,
        notes: '',
      }
      postActionRmsInput.value = null
    }
  },
)

function toggleAction(key: string) {
  const idx = form.value.actionTaken.indexOf(key)
  if (idx >= 0) form.value.actionTaken.splice(idx, 1)
  else form.value.actionTaken.push(key)
}

function close() {
  emit('update:modelValue', false)
}

async function onSave() {
  if (!props.eventId) return
  const event = log.events.find((e) => e.id === props.eventId)
  if (!event) return
  const outcome: DiagnosticOutcome = {
    recordedAt: new Date().toISOString(),
    inspectionDate: form.value.inspectionDate,
    actualFinding: form.value.actualFinding,
    diagnosisAccuracy: form.value.diagnosisAccuracy,
    actionTaken: form.value.actionTaken,
    partsReplaced: form.value.partsReplaced,
    postActionRmsG: postActionRmsInput.value,
    newBaselineEstablished: form.value.newBaselineEstablished,
    notes: form.value.notes,
  }
  log.recordOutcome(props.eventId, outcome)

  if (form.value.newBaselineEstablished && event.conditionKey) {
    void profile.startBaselineCapture(event.conditionKey)
  }
  close()
}
</script>

<style scoped>
.modal-mask {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.55);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}
.modal-card {
  width: 480px;
  max-height: 88vh;
  display: flex;
  flex-direction: column;
  background: var(--bg-1);
  border: 1px solid var(--border);
  border-radius: 6px;
  box-shadow: 0 12px 50px rgba(0, 0, 0, 0.6);
}
.modal-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 14px;
  border-bottom: 1px solid var(--border);
  font-size: 12px;
  letter-spacing: 0.06em;
  color: var(--text-1);
}
.close-x {
  background: transparent;
  border: none;
  color: var(--text-2);
  font-size: 18px;
  cursor: pointer;
}
.modal-body {
  flex: 1;
  overflow-y: auto;
  padding: 12px 14px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.row {
  display: grid;
  grid-template-columns: 110px 1fr;
  gap: 10px;
  align-items: center;
  font-size: 12px;
}
.row > label {
  font-size: 11px;
  color: var(--text-2);
}
.row input,
.row textarea {
  font-size: 12px;
  padding: 4px 6px;
  background: var(--bg-2);
  border: 1px solid var(--border);
  color: var(--text-0);
  border-radius: 2px;
  font-family: inherit;
}
.row textarea {
  resize: vertical;
  min-height: 50px;
}
.radio-group,
.checkbox-group {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  font-size: 11px;
  color: var(--text-1);
}
.radio-group label,
.checkbox-group label {
  display: flex;
  gap: 4px;
  align-items: center;
  cursor: pointer;
}
.cb-line {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  color: var(--text-1);
}
.modal-foot {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 10px 14px;
  border-top: 1px solid var(--border);
}
.modal-foot button {
  padding: 5px 14px;
  font-size: 12px;
  background: var(--bg-2);
  border: 1px solid var(--border);
  border-radius: 3px;
  cursor: pointer;
  color: var(--text-1);
}
.modal-foot button.primary {
  background: rgba(0, 217, 255, 0.1);
  border-color: var(--cyan);
  color: var(--cyan);
}
</style>
