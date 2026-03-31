/**
 * Vite 入口文件
 * 使用 ES modules 导入 Vue 和 App 组件
 */
import { createApp } from 'vue'
import App from './App.vue'
import { i18n } from './locales/index.js'
import glassmorphism from './directives/glassmorphism.js'
import { installAntd } from './installAntd.js'
import { installRendererDiagnostics } from './utils/rendererDiagnostics.js'
// 在 Ant Design 样式之后加载，确保 PIDS 控制台覆盖生效
import './styles/console-page-ant.css'
import './styles/settings-page-ant.css'
import './styles/preset-context-menu.css'
import './styles/station-context-menu.css'
import './styles/cp-glass-modal-shell.css'

installRendererDiagnostics()

// 全局错误处理
window.addEventListener('error', (event) => {
  console.error('[Global Error]', {
    message: event.message,
    filename: event.filename,
    lineno: event.lineno,
    colno: event.colno,
    error: event.error
  })
})

window.addEventListener('unhandledrejection', (event) => {
  console.error('[Unhandled Promise Rejection]', event.reason)
})

// 创建并挂载 Vue 应用（让错误冒泡到全局监听器和 index.html 覆盖层）
const app = createApp(App)
installAntd(app)
app.use(i18n)
app.use(glassmorphism)
app.mount('#app')
