/**
 * Vite 入口文件
 * 使用 ES modules 导入 Vue 和 App 组件
 */
import { createApp } from 'vue'
import App from './App.js'
import { i18n } from './locales/index.js'

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

// 创建并挂载 Vue 应用
try {
const app = createApp(App)
app.use(i18n)
app.mount('#app')
} catch (error) {
  console.error('[Vite] ❌ Vue 应用挂载失败:', error)
  // 显示错误信息到页面
  const errorDiv = document.createElement('div')
  errorDiv.style.cssText = 'position:fixed; top:10px; left:10px; background:red; color:white; padding:20px; z-index:99999; max-width:500px; border-radius:8px;'
  errorDiv.innerHTML = `
    <h3>应用加载失败</h3>
    <p>${error.message}</p>
    <pre style="font-size:12px; overflow:auto; max-height:200px;">${error.stack}</pre>
  `
  document.body.appendChild(errorDiv)
}
