import { createI18n } from 'vue-i18n'
import zhCN from './zh-CN.json'
import zhTW from './zh-TW.json'
import en from './en.json'
import ja from './ja.json'
import ko from './ko.json'

// 根据系统语言自动检测首选语言
function detectLocale() {
  if (typeof navigator === 'undefined') return 'en'
  const raw = navigator.language || (navigator.languages && navigator.languages[0]) || 'en'
  const lang = String(raw).toLowerCase()

  if (lang.startsWith('zh')) {
    if (lang.includes('tw') || lang.includes('hk') || lang.includes('mo')) {
      return 'zh-TW'
    }
    return 'zh-CN'
  }

  if (lang.startsWith('ja')) return 'ja'
  if (lang.startsWith('ko')) return 'ko'

  return 'en'
}

let currentLanguage = detectLocale()

// 如果本地已经有用户选择，优先使用用户选择
const saved = window.localStorage.getItem('mpids-locale')
if (saved === 'zh-CN' || saved === 'zh-TW' || saved === 'en' || saved === 'ja' || saved === 'ko') {
  currentLanguage = saved
}

export const i18n = createI18n({
  legacy: false,
  globalInjection: true,
  locale: currentLanguage,
  fallbackLocale: 'en',
  missingWarn: false,
  fallbackWarn: false,
  messages: {
    'zh-CN': zhCN,
    'zh-TW': zhTW,
    en,
    ja,
    ko
  }
})

export const langs = [
  { key: 'zh-CN', title: '简体中文' },
  { key: 'zh-TW', title: '繁體中文' },
  { key: 'en', title: 'English' },
  { key: 'ja', title: '日本語' },
  { key: 'ko', title: '한국어' }
]

export function setLang(lang) {
  i18n.global.locale.value = lang
  try {
    window.localStorage.setItem('mpids-locale', lang)
  } catch (e) {}
}

export const setLocale = setLang


