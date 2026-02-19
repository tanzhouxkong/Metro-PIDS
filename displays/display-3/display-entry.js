import { createApp } from 'vue'
import DisplayWindow from './DisplayWindow.vue'

console.log('========================================');
<<<<<<< Updated upstream
console.log('[Display-3] 显示器3初始化 (北京地铁LCD，共用display-1的逻辑)');
console.log('[Display-3] 期望尺寸: 1900 x 600');
console.log('[Display-3] 实际窗口尺寸:', window.innerWidth, 'x', window.innerHeight);
=======
<<<<<<< HEAD
console.log('[Display-1] 显示器1初始化 (主显示器，默认直线线路图，可切换 C 型)');
console.log('[Display-1] 期望尺寸: 1900 x 600');
console.log('[Display-1] 实际窗口尺寸:', window.innerWidth, 'x', window.innerHeight);
=======
console.log('[Display-3] 显示器3初始化 (北京地铁LCD，共用display-1的逻辑)');
console.log('[Display-3] 期望尺寸: 1900 x 600');
console.log('[Display-3] 实际窗口尺寸:', window.innerWidth, 'x', window.innerHeight);
>>>>>>> 5e6badfcb798ff4bb795199c1cd04aeb2a4d3fcc
>>>>>>> Stashed changes
console.log('========================================');

const app = createApp(DisplayWindow)
app.mount('#display-root')
