import { createI18n } from 'vue-i18n'
import zhCN from './zh-CN.json'
import zhTW from './zh-TW.json'
import en from './en.json'
import ja from './ja.json'
import ko from './ko.json'

function normalizeLocaleKey(input) {
  const raw = String(input || '').trim()
  if (!raw) return null

  const canonical = raw.replace(/_/g, '-')
  const lowerNoDash = canonical.replace(/-/g, '').toLowerCase()
  const lower = canonical.toLowerCase()

  // 容错：忽略 zhcn 的大小写（以及常见分隔写法）
  if (lowerNoDash === 'zhcn' || lower === 'zh-cn') return 'zh-CN'
  if (lowerNoDash === 'zhtw' || lower === 'zh-tw') return 'zh-TW'

  if (lower === 'en') return 'en'
  if (lower === 'ja') return 'ja'
  if (lower === 'ko') return 'ko'

  // 容错：例如 zh / zh-hans / zh-hant / zh-hk 等
  if (lower.startsWith('zh')) {
    if (/(^|-)tw($|-)/.test(lower) || /(^|-)hk($|-)/.test(lower) || /(^|-)mo($|-)/.test(lower)) {
      return 'zh-TW'
    }
    return 'zh-CN'
  }

  return null
}

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
const normalizedSaved = normalizeLocaleKey(saved)
if (normalizedSaved) {
  currentLanguage = normalizedSaved
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
  const normalized = normalizeLocaleKey(lang) || lang
  i18n.global.locale.value = normalized
  try {
    window.localStorage.setItem('mpids-locale', normalized)
  } catch (e) {}
}

export const setLocale = setLang


