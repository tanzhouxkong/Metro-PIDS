import { createApp } from 'vue'
import DisplayWindow from './DisplayWindow.vue'
import { setupWindowThemeSync } from '../../src/utils/windowSettingsSync.js'

console.log('========================================')
setupWindowThemeSync()
console.log('[Display-3] 显示器3初始化 (LCD 弧形布局)')
console.log('[Display-3] 期望尺寸: 1900 x 600')
console.log('[Display-3] 实际窗口尺寸:', window.innerWidth, 'x', window.innerHeight)
console.log('========================================')

createApp(DisplayWindow).mount('#display-root')
