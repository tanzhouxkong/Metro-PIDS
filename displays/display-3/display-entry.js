import { createApp } from 'vue'
import DisplayWindow from './DisplayWindow.vue'

console.log('========================================');
console.log('[Display-3] 显示器3初始化 (北京地铁LCD，共用display-1的逻辑)');
console.log('[Display-3] 期望尺寸: 1900 x 600');
console.log('[Display-3] 实际窗口尺寸:', window.innerWidth, 'x', window.innerHeight);
console.log('========================================');

const app = createApp(DisplayWindow)
app.mount('#display-root')
