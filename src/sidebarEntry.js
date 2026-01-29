// 侧边栏入口文件（用于 BrowserView）
// 使用静态导入，与 topbarEntry.js 保持一致
import { createApp } from 'vue'
import LeftRail from './components/LeftRail.js'

// 检查容器元素（侧边栏 BrowserView 只包含侧边栏，不包含顶部栏）
const leftrailContainer = document.getElementById('leftrail-app')

if (!LeftRail) {
    console.error('[Sidebar] LeftRail 组件未找到')
    const errorDiv = document.createElement('div')
    errorDiv.style.cssText = 'position:fixed; top:10px; left:10px; background:red; color:white; padding:10px; z-index:9999; max-width:400px; border-radius:6px; box-shadow:0 4px 12px rgba(0,0,0,0.3);'
    errorDiv.innerHTML = `
        <div style="font-weight:bold; margin-bottom:8px;">加载错误</div>
        <div style="font-size:12px; line-height:1.5;">LeftRail 组件未找到</div>
    `
    document.body.appendChild(errorDiv)
} else {
    console.log('[Sidebar] 开始挂载 LeftRail 组件...')
    const leftrailApp = createApp(LeftRail)
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
}
