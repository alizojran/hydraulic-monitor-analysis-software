import { createApp } from 'vue'
import { createPinia } from 'pinia'
import { createI18n } from 'vue-i18n'
import App from './App.vue'
import zh from './locales/zh.json'
import en from './locales/en.json'
import './styles/tokens.css'
import './styles/base.css'

const savedLocale = (localStorage.getItem('daq-locale') as 'zh' | 'en') || 'zh'

const i18n = createI18n({
  legacy: false,
  locale: savedLocale,
  fallbackLocale: 'zh',
  messages: { zh, en },
})

const app = createApp(App)
app.use(createPinia())
app.use(i18n)

app.mount('#app')

// Detect WebGL2 support + GPU name after mount (stores are available)
const testCanvas = document.createElement('canvas')
const gl2 = testCanvas.getContext('webgl2')
if (gl2) {
  const ext = gl2.getExtension('WEBGL_debug_renderer_info')
  const gpuName = ext ? (gl2.getParameter(ext.UNMASKED_RENDERER_WEBGL) as string) : 'WebGL2'
  const { useUiStore } = await import('./stores/ui')
  useUiStore().setGpu(true, gpuName.replace(/\s+ANGLE.*/i, '').slice(0, 40))
}
