import { createApp } from 'vue'
import DisplayWindow from './DisplayWindow.vue'

console.log('========================================');
console.log('[Display-3] 显示器3初始化 (C 型线路图)');
console.log('[Display-3] 期望尺寸: 1900 x 600');
console.log('[Display-3] 实际窗口尺寸:', window.innerWidth, 'x', window.innerHeight);
console.log('[Display-3] 屏幕尺寸:', window.screen.width, 'x', window.screen.height);
console.log('[Display-3] 设备像素比:', window.devicePixelRatio);
console.log('========================================');

window.addEventListener('resize', () => {
  console.log('[Display-3] 窗口尺寸变化:', window.innerWidth, 'x', window.innerHeight);
});

setTimeout(() => {
  console.log('[Display-3] 延迟检查 - 窗口尺寸:', window.innerWidth, 'x', window.innerHeight);
  if (window.innerWidth !== 1900 || window.innerHeight !== 600) {
    console.warn('[Display-3] ⚠️ 窗口尺寸不匹配！期望: 1900x600, 实际:', window.innerWidth + 'x' + window.innerHeight);
  } else {
    console.log('[Display-3] ✅ 窗口尺寸正确');
  }
}, 1000);

const app = createApp(DisplayWindow)
app.mount('#display-root')

