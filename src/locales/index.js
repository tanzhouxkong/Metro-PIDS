import { createI18n } from 'vue-i18n'
import zhCN from './zh-CN.json'
import zhTW from './zh-TW.json'
import en from './en.json'
<<<<<<< Updated upstream
<<<<<<< Updated upstream
<<<<<<< Updated upstream

// 语言 key 类型说明：'zh-CN' | 'zh-TW' | 'en'
=======
=======
>>>>>>> Stashed changes
=======
>>>>>>> Stashed changes
import ja from './ja.json'
import ko from './ko.json'

// 语言 key 类型说明：'zh-CN' | 'zh-TW' | 'en' | 'ja' | 'ko'
<<<<<<< Updated upstream
<<<<<<< Updated upstream
>>>>>>> Stashed changes
=======
>>>>>>> Stashed changes
=======
>>>>>>> Stashed changes

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

<<<<<<< Updated upstream
<<<<<<< Updated upstream
<<<<<<< Updated upstream
=======
  if (lang.startsWith('ja')) return 'ja'
  if (lang.startsWith('ko')) return 'ko'

>>>>>>> Stashed changes
=======
  if (lang.startsWith('ja')) return 'ja'
  if (lang.startsWith('ko')) return 'ko'

>>>>>>> Stashed changes
=======
  if (lang.startsWith('ja')) return 'ja'
  if (lang.startsWith('ko')) return 'ko'

>>>>>>> Stashed changes
  return 'en'
}

let currentLanguage = detectLocale()

// 如果本地已经有用户选择，优先使用用户选择
const saved = window.localStorage.getItem('mpids-locale')
<<<<<<< Updated upstream
<<<<<<< Updated upstream
<<<<<<< Updated upstream
if (saved === 'zh-CN' || saved === 'zh-TW' || saved === 'en') {
=======
if (saved === 'zh-CN' || saved === 'zh-TW' || saved === 'en' || saved === 'ja' || saved === 'ko') {
>>>>>>> Stashed changes
=======
if (saved === 'zh-CN' || saved === 'zh-TW' || saved === 'en' || saved === 'ja' || saved === 'ko') {
>>>>>>> Stashed changes
=======
if (saved === 'zh-CN' || saved === 'zh-TW' || saved === 'en' || saved === 'ja' || saved === 'ko') {
>>>>>>> Stashed changes
  currentLanguage = saved
}

export const i18n = createI18n({
  legacy: false,
  globalInjection: true,
  locale: currentLanguage,
<<<<<<< Updated upstream
<<<<<<< Updated upstream
<<<<<<< Updated upstream
  messages: {
    'zh-CN': zhCN,
    'zh-TW': zhTW,
    en
=======
=======
>>>>>>> Stashed changes
=======
>>>>>>> Stashed changes
  fallbackLocale: 'en',
  messages: {
    'zh-CN': zhCN,
    'zh-TW': zhTW,
    en,
    ja,
    ko
<<<<<<< Updated upstream
<<<<<<< Updated upstream
>>>>>>> Stashed changes
=======
>>>>>>> Stashed changes
=======
>>>>>>> Stashed changes
  }
})

export const langs = [
  { key: 'zh-CN', title: '简体中文' },
  { key: 'zh-TW', title: '繁體中文' },
<<<<<<< Updated upstream
<<<<<<< Updated upstream
<<<<<<< Updated upstream
  { key: 'en', title: 'English' }
]

export function setLocale(lang) {
  if (lang !== 'zh-CN' && lang !== 'zh-TW' && lang !== 'en') return
=======
=======
>>>>>>> Stashed changes
=======
>>>>>>> Stashed changes
  { key: 'en', title: 'English' },
  { key: 'ja', title: '日本語' },
  { key: 'ko', title: '한국어' }
]

export function setLocale(lang) {
  if (lang !== 'zh-CN' && lang !== 'zh-TW' && lang !== 'en' && lang !== 'ja' && lang !== 'ko') return
<<<<<<< Updated upstream
<<<<<<< Updated upstream
>>>>>>> Stashed changes
=======
>>>>>>> Stashed changes
=======
>>>>>>> Stashed changes
  i18n.global.locale.value = lang
  try {
    window.localStorage.setItem('mpids-locale', lang)
  } catch (e) {}
}

