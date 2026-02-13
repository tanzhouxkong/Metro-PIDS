import { createI18n } from 'vue-i18n'
import zhCN from './zh-CN.json'
import zhTW from './zh-TW.json'
import en from './en.json'

// 语言 key 类型说明：'zh-CN' | 'zh-TW' | 'en'

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

  return 'en'
}

let currentLanguage = detectLocale()

// 如果本地已经有用户选择，优先使用用户选择
const saved = window.localStorage.getItem('mpids-locale')
if (saved === 'zh-CN' || saved === 'zh-TW' || saved === 'en') {
  currentLanguage = saved
}

export const i18n = createI18n({
  legacy: false,
  globalInjection: true,
  locale: currentLanguage,
  messages: {
    'zh-CN': zhCN,
    'zh-TW': zhTW,
    en
  }
})

export const langs = [
  { key: 'zh-CN', title: '简体中文' },
  { key: 'zh-TW', title: '繁體中文' },
  { key: 'en', title: 'English' }
]

export function setLocale(lang) {
  if (lang !== 'zh-CN' && lang !== 'zh-TW' && lang !== 'en') return
  i18n.global.locale.value = lang
  try {
    window.localStorage.setItem('mpids-locale', lang)
  } catch (e) {}
}

