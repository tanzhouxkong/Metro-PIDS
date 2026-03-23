/**
 * Vite 入口文件
 * 使用 ES modules 导入 Vue 和 App 组件
 */
import { createApp } from 'vue'
import App from './App.js'
import { i18n } from './locales/index.js'
import glassmorphism from 'vue3-glassmorphism'

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
app.use(i18n)
app.use(glassmorphism)
app.mount('#app')
