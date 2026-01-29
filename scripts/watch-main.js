const fs = require('fs');
const path = require('path');

// 确保 out/main 目录存在
const outDir = path.join(__dirname, '..', 'out', 'main');
const target = path.join(outDir, 'main.js');
const source = path.join(__dirname, '..', 'main.js');

if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
}

// 复制文件的函数
const copyMainFile = () => {
  if (fs.existsSync(source)) {
    try {
      fs.copyFileSync(source, target);
      return true;
    } catch (e) {
      console.error('[watch-main] ❌ Failed to copy main.js:', e);
      return false;
    }
  }
  return false;
};

// 立即复制一次
copyMainFile();

// 持续监控并确保文件存在（每 100ms 检查一次）
const interval = setInterval(() => {
  if (!fs.existsSync(target)) {
    copyMainFile();
  }
}, 100);

// 30 秒后停止监控（应该足够 Electron 启动了）
setTimeout(() => {
  clearInterval(interval);
  console.log('[watch-main] ✅ Stopped monitoring (Electron should be started)');
}, 30000);

// 处理退出信号
process.on('SIGINT', () => {
  clearInterval(interval);
  process.exit(0);
});

process.on('SIGTERM', () => {
  clearInterval(interval);
  process.exit(0);
});

console.log('[watch-main] ✅ Started monitoring main.js file');

