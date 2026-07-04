import { defineStore } from 'pinia'
import { ref } from 'vue'

export type TabId = 'realtime' | 'spectrum' | 'history' | 'alarms' | 'config'
export type Locale = 'zh' | 'en'

export const useUiStore = defineStore('ui', () => {
  const activeTab = ref<TabId>('realtime')
  const locale = ref<Locale>((localStorage.getItem('daq-locale') as Locale) || 'zh')
  const fps = ref(0)
  const gpuAvailable = ref(false)
  const gpuName = ref('')
  const showFileDropZone = ref(false)
  const loadingActive = ref(false)
  const loadingProgress = ref(0)
  const loadingLabel = ref('')

  function setTab(tab: TabId) {
    activeTab.value = tab
  }

  function setLocale(lang: Locale) {
    locale.value = lang
    localStorage.setItem('daq-locale', lang)
    document.documentElement.lang = lang === 'zh' ? 'zh-CN' : 'en'
  }

  function setFps(v: number) {
    fps.value = v
  }
  function setGpu(available: boolean, name: string) {
    gpuAvailable.value = available
    gpuName.value = name
  }
  function setLoading(active: boolean, progress = 0, label = '') {
    loadingActive.value = active
    loadingProgress.value = progress
    loadingLabel.value = label
  }

  return {
    activeTab,
    locale,
    fps,
    gpuAvailable,
    gpuName,
    showFileDropZone,
    loadingActive,
    loadingProgress,
    loadingLabel,
    setTab,
    setLocale,
    setFps,
    setGpu,
    setLoading,
  }
})
