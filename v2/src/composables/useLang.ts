import { useI18n } from 'vue-i18n'

export function useLang() {
  const { locale } = useI18n()

  function lng(zh: string, en: string): string {
    return locale.value === 'zh' ? zh : en
  }

  return { lng }
}
