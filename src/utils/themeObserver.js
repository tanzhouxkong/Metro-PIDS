const readStoredThemeMode = () => {
  try {
    const raw = window.localStorage.getItem('pids_settings_v1')
    if (!raw) return 'system'
    const settings = JSON.parse(raw)
    const mode = String(settings?.themeMode || 'system')
    if (mode === 'dark' || mode === 'light' || mode === 'system') return mode
    return 'system'
  } catch (e) {
    return 'system'
  }
}

export const resolveObservedDarkTheme = () => {
  try {
    if (typeof document === 'undefined') return false
    const themeMode = readStoredThemeMode()
    if (themeMode === 'dark') return true
    if (themeMode === 'light') return false
    const root = document.documentElement
    const byClass = root.classList.contains('dark') || root.getAttribute('data-theme') === 'dark'
    const byMedia = typeof window !== 'undefined' && window.matchMedia
      ? window.matchMedia('(prefers-color-scheme: dark)').matches
      : false
    return byClass || byMedia
  } catch (e) {
    return false
  }
}

export const observeThemeState = (applyThemeState) => {
  if (typeof applyThemeState !== 'function') return () => {}

  let themeObserver = null
  let mediaQueryList = null
  let mediaQueryHandler = null

  const updateThemeState = () => {
    applyThemeState(resolveObservedDarkTheme())
  }

  updateThemeState()

  if (typeof document !== 'undefined' && typeof MutationObserver !== 'undefined') {
    themeObserver = new MutationObserver(() => updateThemeState())
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class', 'data-theme']
    })
  }

  if (typeof window !== 'undefined' && window.matchMedia) {
    mediaQueryList = window.matchMedia('(prefers-color-scheme: dark)')
    mediaQueryHandler = () => updateThemeState()
    if (typeof mediaQueryList.addEventListener === 'function') {
      mediaQueryList.addEventListener('change', mediaQueryHandler)
    } else if (typeof mediaQueryList.addListener === 'function') {
      mediaQueryList.addListener(mediaQueryHandler)
    }
  }

  return () => {
    if (themeObserver) {
      themeObserver.disconnect()
      themeObserver = null
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
