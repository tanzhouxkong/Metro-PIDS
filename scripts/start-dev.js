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
  const env = { ...process.env };
  // 方案B：Attach 调试需要主进程 inspector 端口
  // electron-vite 会读取 VITE_ELECTRON_INSPECT；未设置时默认不开 inspect
  if (!env.VITE_ELECTRON_INSPECT) env.VITE_ELECTRON_INSPECT = '9229';
  // 渲染进程调试（DevTools 协议端口），用于附加 pwa-chrome/msedge
  if (!env.VITE_REMOTE_DEBUGGING_PORT) env.VITE_REMOTE_DEBUGGING_PORT = '9222';

  const electronVite = spawn('npx', ['electron-vite', 'dev'], {
    stdio: 'inherit',
    env,
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

