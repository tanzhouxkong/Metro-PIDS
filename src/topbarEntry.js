import { createApp } from 'vue'
import Topbar from './components/Topbar.vue'
import { installAntd } from './installAntd.js'

window.__TOPBAR_ENTRY_LOADED = true
console.log('[Topbar] entry loaded')

window.addEventListener('error', (event) => {
	console.error('[Topbar] window error:', event.message, event.error)
})
window.addEventListener('unhandledrejection', (event) => {
	console.error('[Topbar] unhandled rejection:', event.reason)
})

const app = createApp(Topbar)
installAntd(app)
app.config.errorHandler = (err, instance, info) => {
	console.error('[Topbar] Vue 运行时错误:', info, err)
}
app.mount('#topbar-app')

