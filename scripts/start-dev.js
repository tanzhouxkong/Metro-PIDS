const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

// 启动监控脚本
const watchScript = path.join(__dirname, 'watch-main.js');
const watchProcess = spawn('node', [watchScript], {
  detached: true,
  stdio: 'ignore'
});
watchProcess.unref();

// 等待一小段时间确保监控脚本启动
setTimeout(() => {
  // 启动 electron-vite
  const electronVite = spawn('npx', ['electron-vite', 'dev'], {
    stdio: 'inherit',
    shell: true
  });

  electronVite.on('exit', (code) => {
    process.exit(code || 0);
  });

  // 处理退出信号
  process.on('SIGINT', () => {
    electronVite.kill('SIGINT');
    process.exit(0);
  });

  process.on('SIGTERM', () => {
    electronVite.kill('SIGTERM');
    process.exit(0);
  });
}, 200);

