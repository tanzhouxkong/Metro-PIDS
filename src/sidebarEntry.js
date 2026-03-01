// 侧边栏入口文件（用于 BrowserView）
import { createApp } from 'vue'

window.__SIDEBAR_ENTRY_LOADED = true
console.log('[Sidebar] entry loaded')

window.addEventListener('error', (event) => {
    console.error('[Sidebar] window error:', event.message, event.error)
})
window.addEventListener('unhandledrejection', (event) => {
    console.error('[Sidebar] unhandled rejection:', event.reason)
})

// 检查容器元素（侧边栏 BrowserView 只包含侧边栏，不包含顶部栏）
const leftrailContainer = document.getElementById('leftrail-app')

const showError = (title, message) => {
    const errorDiv = document.createElement('div')
    errorDiv.style.cssText = 'position:fixed; top:10px; left:10px; background:red; color:white; padding:10px; z-index:9999; max-width:400px; border-radius:6px; box-shadow:0 4px 12px rgba(0,0,0,0.3);'
    errorDiv.innerHTML = `
        <div style="font-weight:bold; margin-bottom:8px;">${title}</div>
        <div style="font-size:12px; line-height:1.5; white-space:pre-wrap;">${message}</div>
    `
    document.body.appendChild(errorDiv)
}

;(async () => {
    let LeftRail = null
    try {
        const mod = await import('./components/LeftRail.js')
        LeftRail = mod?.default
    } catch (error) {
        console.error('[Sidebar] 导入 LeftRail 失败:', error)
        showError('模块加载错误', String(error?.message || error))
        return
    }

    if (!LeftRail) {
        console.error('[Sidebar] LeftRail 组件未找到')
        showError('加载错误', 'LeftRail 组件未找到')
        return
    }

    console.log('[Sidebar] 开始挂载 LeftRail 组件...')
    const leftrailApp = createApp(LeftRail)
    leftrailApp.config.errorHandler = (err, instance, info) => {
        console.error('[Sidebar] Vue 运行时错误:', info, err)
    }
    leftrailApp.mount('#leftrail-app')
    console.log('[Sidebar] ✅ LeftRail 组件挂载成功')
    
    // 延迟检查 DOM
    setTimeout(() => {
        const topbarEl = document.getElementById('topbar-app')
        const leftrailEl = document.getElementById('leftrail-app')
        const leftRailDiv = document.getElementById('leftRail')
        const buttons = leftRailDiv?.querySelectorAll('button') || leftrailEl?.querySelectorAll('button')
        console.log('[Sidebar] DOM 检查完成，按钮数量:', buttons?.length || 0)
    }, 2000)
})()
