import { createApp } from 'vue'
import LeftRail from './components/LeftRail.vue'
import { installAntd } from './installAntd.js'
import { i18n } from './locales/index.js'
import { setupWindowThemeSync, setupWindowLocaleSync } from './utils/windowSettingsSync.js'

window.__SIDEBAR_ENTRY_LOADED = false

const container = document.getElementById('leftrail-app')
let stopThemeSync = null
let stopLocaleSync = null

if (!container) {
  console.error('[Sidebar] Mount container #leftrail-app not found')
} else if (!LeftRail) {
  console.error('[Sidebar] LeftRail component not found')
} else {
  try {
    console.log('[Sidebar] Mounting LeftRail...')
    stopThemeSync = setupWindowThemeSync()
    stopLocaleSync = setupWindowLocaleSync(i18n)
    const app = createApp(LeftRail)
    installAntd(app)
    app.use(i18n)
    app.mount(container)
    window.__SIDEBAR_ENTRY_LOADED = true
    console.log('[Sidebar] LeftRail mounted successfully')

    setTimeout(() => {
      const leftRailEl = document.getElementById('leftRail')
      const buttons = leftRailEl?.querySelectorAll('button') || container.querySelectorAll('button')
      console.log('[Sidebar] DOM check complete, button count:', buttons?.length || 0)
    }, 2000)
  } catch (error) {
    window.__SIDEBAR_ENTRY_LOADED = false
    if (stopThemeSync) stopThemeSync()
    if (stopLocaleSync) stopLocaleSync()
    console.error('[Sidebar] Failed to mount LeftRail', error)
  }
}
