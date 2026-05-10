<template>
  <div class="profile-switcher">
    <!-- Profile selector dropdown -->
    <div class="ps-left">
      <span class="ps-label">{{ $t('config.profile') }}</span>
      <div class="ps-select-wrap">
        <select class="ps-select" :value="ps.activeProfileName" @change="onSelect">
          <option :value="DEFAULT_PROFILE_NAME">{{ DEFAULT_PROFILE_NAME }}</option>
          <option v-for="p in savedProfiles" :key="p.name" :value="p.name">{{ p.name }}</option>
        </select>
      </div>
      <span v-if="isDirty" class="ps-unsaved">●</span>
    </div>

    <!-- Actions -->
    <div class="ps-actions">
      <button class="ps-btn primary" :title="$t('config.profileSave')" @click="saveToActive">
        💾 {{ $t('config.profileSave') }}
      </button>
      <button class="ps-btn" :title="$t('config.profileNew')" @click="showNew = true">
        + {{ $t('config.profileNew') }}
      </button>
      <button class="ps-btn" :title="$t('config.profileClone')" @click="cloneActive">⧉</button>
      <button class="ps-btn" :title="$t('config.profileExport')" @click="exportActive">⤓</button>
      <button class="ps-btn" :title="$t('config.profileImport')" @click="triggerImport">⤒</button>
      <button
        v-if="ps.activeProfileName !== DEFAULT_PROFILE_NAME"
        class="ps-btn danger"
        :title="$t('config.profileDelete')"
        @click="deleteActive"
      >
        ×
      </button>
      <input
        ref="importInput"
        type="file"
        accept=".json"
        style="display: none"
        @change="onImport"
      />
    </div>

    <!-- New profile modal -->
    <div v-if="showNew" class="modal-overlay" @click.self="showNew = false">
      <div class="modal">
        <div class="modal-title">{{ $t('config.profileNew') }}</div>
        <input
          v-model="newName"
          type="text"
          :placeholder="$t('config.profileNamePlaceholder')"
          class="modal-input"
          autofocus
          @keydown.enter="confirmNew"
        />
        <div class="modal-actions">
          <button @click="showNew = false">{{ $t('common.cancel') }}</button>
          <button class="primary" :disabled="!newName.trim()" @click="confirmNew">
            {{ $t('common.confirm') }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useProfilesStore, DEFAULT_PROFILE_NAME } from '@/stores/profiles'

const { locale } = useI18n()
const ps = useProfilesStore()

const importInput = ref<HTMLInputElement | null>(null)
const showNew = ref(false)
const newName = ref('')
const isDirty = ref(false) // cosmetic unsaved indicator

const savedProfiles = computed(() => ps.profiles.filter((p) => p.name !== DEFAULT_PROFILE_NAME))

function onSelect(e: Event) {
  const name = (e.target as HTMLSelectElement).value
  if (name === ps.activeProfileName) return
  // If there is a saved snapshot for this profile, apply it
  const snap = ps.profiles.find((p) => p.name === name)
  ps.setActive(name)
  if (snap) {
    const newLocale = ps.applyProfile(snap)
    if (newLocale && newLocale !== locale.value) {
      locale.value = newLocale as 'zh' | 'en'
      localStorage.setItem('daq-locale', newLocale)
    }
  }
  isDirty.value = false
}

function saveToActive() {
  ps.saveToActive()
  isDirty.value = false
}

function confirmNew() {
  const name = newName.value.trim()
  if (!name) return
  ps.cloneProfile(ps.activeProfileName, name)
  ps.saveToActive()
  showNew.value = false
  newName.value = ''
  isDirty.value = false
}

function cloneActive() {
  const base = ps.activeProfileName
  let candidate = base + ' (copy)'
  let n = 2
  while (ps.profiles.find((p) => p.name === candidate)) {
    candidate = `${base} (copy ${n++})`
  }
  ps.cloneProfile(base, candidate)
}

function exportActive() {
  try {
    const json = ps.exportProfile(ps.activeProfileName)
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `hmas-profile-${ps.activeProfileName.replace(/\s+/g, '_')}.json`
    a.click()
    URL.revokeObjectURL(url)
  } catch {
    // Profile not saved yet — capture and export
    const snap = ps.captureCurrentState(ps.activeProfileName)
    const blob = new Blob([JSON.stringify(snap, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `hmas-profile-${ps.activeProfileName.replace(/\s+/g, '_')}.json`
    a.click()
    URL.revokeObjectURL(url)
  }
}

function triggerImport() {
  importInput.value?.click()
}

async function onImport(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (!file) return
  try {
    const text = await file.text()
    ps.importProfile(text)
  } catch (err) {
    alert('Profile import failed: ' + err)
  }
  ;(e.target as HTMLInputElement).value = ''
}

function deleteActive() {
  if (!confirm(`Delete profile "${ps.activeProfileName}"?`)) return
  ps.deleteProfile(ps.activeProfileName)
}
</script>

<style scoped>
.profile-switcher {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  padding: 6px 12px;
  background: var(--bg-1);
  border-bottom: 1px solid var(--border);
}
.ps-left {
  display: flex;
  align-items: center;
  gap: 6px;
}
.ps-label {
  font-size: 10px;
  color: var(--text-2);
  letter-spacing: 0.06em;
  text-transform: uppercase;
  white-space: nowrap;
}
.ps-select-wrap {
  position: relative;
}
.ps-select {
  font-size: 11px;
  padding: 3px 8px;
  height: 24px;
  min-width: 140px;
  background: var(--bg-2);
  border: 1px solid var(--cyan);
  border-radius: 2px;
  color: var(--text-1);
}
.ps-unsaved {
  color: var(--amber);
  font-size: 14px;
  line-height: 1;
}
.ps-actions {
  display: flex;
  gap: 4px;
}
.ps-btn {
  font-size: 11px;
  padding: 2px 9px;
  height: 24px;
  background: var(--bg-2);
  border: 1px solid var(--border);
  border-radius: 2px;
  color: var(--text-2);
  white-space: nowrap;
}
.ps-btn:hover {
  border-color: var(--text-2);
  color: var(--text-1);
}
.ps-btn.primary {
  background: rgba(0, 217, 255, 0.1);
  border-color: var(--cyan);
  color: var(--cyan);
}
.ps-btn.primary:hover {
  background: rgba(0, 217, 255, 0.18);
}
.ps-btn.danger {
  color: var(--red);
  border-color: rgba(255, 51, 85, 0.3);
}

.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 300;
}
.modal {
  background: var(--bg-1);
  border: 1px solid var(--border);
  border-radius: 4px;
  padding: 20px;
  min-width: 300px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.modal-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-1);
}
.modal-input {
  font-size: 13px;
  padding: 6px 10px;
  background: var(--bg-2);
  border: 1px solid var(--border);
  border-radius: 2px;
  color: var(--text-1);
  outline: none;
  width: 100%;
}
.modal-input:focus {
  border-color: var(--cyan);
}
.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
.primary {
  background: rgba(0, 217, 255, 0.12);
  border: 1px solid var(--cyan);
  color: var(--cyan);
  padding: 4px 14px;
  border-radius: 2px;
  font-size: 12px;
}
.primary:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
</style>
