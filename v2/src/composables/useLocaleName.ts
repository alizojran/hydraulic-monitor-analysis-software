import { useI18n } from 'vue-i18n'

type LocaleNamed = { nameZh?: string; nameEn?: string }
type LocaleLabeled = { labelZh?: string; label?: string }
type LocaleDescribed = { descriptionZh?: string; description?: string }

export function useLocaleName() {
  const { locale } = useI18n()

  function localName(item: LocaleNamed): string {
    return locale.value === 'zh' ? (item.nameZh ?? '') : (item.nameEn ?? '')
  }

  function localLabel(item: LocaleLabeled): string {
    return locale.value === 'zh' ? (item.labelZh ?? '') : (item.label ?? '')
  }

  function localDescription(item: LocaleDescribed): string {
    return locale.value === 'zh' ? (item.descriptionZh ?? '') : (item.description ?? '')
  }

  return { localName, localLabel, localDescription }
}
