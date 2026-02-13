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

// 监听主进程的日志输出（用于调试 mica-electron 等）
if (typeof window !== 'undefined' && window.electronAPI) {
  try {
    // 通过 preload 暴露的 API 监听主进程日志
    if (window.electronAPI.onMainConsoleLog) {
      window.electronAPI.onMainConsoleLog((message) => {
        console.log('[Main Process]', message);
      });
    }
    
    if (window.electronAPI.onMainConsoleError) {
      window.electronAPI.onMainConsoleError((message) => {
        console.error('[Main Process]', message);
      });
    }
    
    console.log('[Vite] ✅ 已设置主进程日志监听器');
  } catch (e) {
    console.warn('[Vite] ⚠️ 无法设置主进程日志监听器:', e.message);
  }
} else if (typeof window !== 'undefined') {
  console.warn('[Vite] ⚠️ window.electronAPI 不可用，无法设置主进程日志监听器');
}

// 创建并挂载 Vue 应用
try {
const app = createApp(App)
app.use(i18n)
app.mount('#app')
  console.log('[Vite] ✅ Vue 应用已成功挂载')
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
