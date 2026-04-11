export const readStoredLocale = () => {
  try {
    return String(window.localStorage.getItem('mpids-locale') || '').trim() || 'zh-CN'
  } catch (e) {
    return 'zh-CN'
  }
}

export const applyThemeModeToDocument = () => {
  try {
    if (typeof document === 'undefined') return false
    const root = document.documentElement
    let themeMode = 'system'
    try {
      const raw = window.localStorage.getItem('pids_settings_v1')
      if (raw) {
        const settings = JSON.parse(raw)
        themeMode = String(settings?.themeMode || 'system')
      }
    } catch (e) {}

    const systemDark = typeof window !== 'undefined' && window.matchMedia
      ? window.matchMedia('(prefers-color-scheme: dark)').matches
      : false
    const isDark = themeMode === 'dark' || (themeMode === 'system' && systemDark)
    const nextText = isDark ? '#EAF2FF' : '#2F3542'
    const nextTheme = isDark ? 'dark' : 'light'
    if (root.style.getPropertyValue('--text') !== nextText) {
      root.style.setProperty('--text', nextText)
    }
    if (root.style.getPropertyValue('--display-titlebar-text') !== nextText) {
      root.style.setProperty('--display-titlebar-text', nextText)
    }
    if (root.classList.contains('dark') !== isDark) {
      root.classList.toggle('dark', isDark)
    }
    if (root.getAttribute('data-theme') !== nextTheme) {
      root.setAttribute('data-theme', nextTheme)
    }
    return isDark
  } catch (e) {
    return false
  }
}

export const setupWindowThemeSync = () => {
  let mediaQueryList = null
  let mediaQueryHandler = null
  let focusHandler = null
  let visibilityHandler = null

  const apply = () => applyThemeModeToDocument()
  apply()

  const storageHandler = (event) => {
    if (!event || event.key === 'pids_settings_v1' || event.key === null) {
      apply()
    }
  }
  window.addEventListener('storage', storageHandler)

  if (typeof window !== 'undefined' && window.matchMedia) {
    mediaQueryList = window.matchMedia('(prefers-color-scheme: dark)')
    mediaQueryHandler = () => apply()
    if (typeof mediaQueryList.addEventListener === 'function') {
      mediaQueryList.addEventListener('change', mediaQueryHandler)
    } else if (typeof mediaQueryList.addListener === 'function') {
      mediaQueryList.addListener(mediaQueryHandler)
    }
  }
  focusHandler = () => apply()
  visibilityHandler = () => apply()
  window.addEventListener('focus', focusHandler)
  document.addEventListener('visibilitychange', visibilityHandler)

  return () => {
    window.removeEventListener('storage', storageHandler)
    if (focusHandler) {
      window.removeEventListener('focus', focusHandler)
      focusHandler = null
    }
    if (visibilityHandler) {
      document.removeEventListener('visibilitychange', visibilityHandler)
      visibilityHandler = null
    }
    if (mediaQueryList && mediaQueryHandler) {
      if (typeof mediaQueryList.removeEventListener === 'function') {
        mediaQueryList.removeEventListener('change', mediaQueryHandler)
      } else if (typeof mediaQueryList.removeListener === 'function') {
        mediaQueryList.removeListener(mediaQueryHandler)
      }
    }
    mediaQueryList = null
    mediaQueryHandler = null
  }
}

export const setupWindowLocaleSync = (i18n) => {
  if (!i18n?.global?.locale) return () => {}
  let focusHandler = null
  let visibilityHandler = null

  const apply = () => {
    const nextLocale = readStoredLocale()
    if (i18n.global.locale.value !== nextLocale) {
      i18n.global.locale.value = nextLocale
    }
  }
  apply()

  const storageHandler = (event) => {
    if (!event || event.key === 'mpids-locale' || event.key === null) {
      apply()
    }
  }
  window.addEventListener('storage', storageHandler)
  focusHandler = () => apply()
  visibilityHandler = () => apply()
  window.addEventListener('focus', focusHandler)
  document.addEventListener('visibilitychange', visibilityHandler)

  return () => {
    window.removeEventListener('storage', storageHandler)
    if (focusHandler) {
      window.removeEventListener('focus', focusHandler)
      focusHandler = null
    }
    if (visibilityHandler) {
      document.removeEventListener('visibilitychange', visibilityHandler)
      visibilityHandler = null
    }
  }
}
