import { createApp } from 'vue'
import HKDisplay from './HKDisplay.vue'
import { createDisplaySdk } from '../../src/utils/displaySdk.js'

console.log('========================================')
console.log('[Display-3] 显示器3初始化 (香港地铁风格线路图)')
console.log('[Display-3] 期望尺寸: 1600 x 500')
console.log('[Display-3] 实际窗口尺寸:', window.innerWidth, 'x', window.innerHeight)
console.log('========================================')

// 安装与显示器1一致的键盘 SDK，支持用户自定义快捷键
try {
  const sdk = createDisplaySdk({ channelName: 'metro_pids_v3' })
  sdk.installKeyboardHandler()
  console.log('[Display-3] 键盘 SDK 已安装')
} catch (e) {
  console.warn('[Display-3] 键盘 SDK 安装失败:', e)
}

window.addEventListener('resize', () => {
  console.log('[Display-3] 窗口尺寸变化:', window.innerWidth, 'x', window.innerHeight)
})

const app = createApp(HKDisplay)
app.mount('#display-root')

