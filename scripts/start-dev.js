const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

function sanitizeDebugEnv(rawEnv) {
  const env = { ...rawEnv };
  const keepDebugAttach = env.METRO_PIDS_DEV_DEBUG_ATTACH === '1';
  if (keepDebugAttach) return env;

  delete env.VSCODE_INSPECTOR_OPTIONS;
  // 在 VS Code JavaScript Debug Terminal 中，NODE_OPTIONS 常含复杂引号参数；
  // 这里直接移除，避免出现 "invalid value for NODE_OPTIONS (unterminated string)"
  delete env.NODE_OPTIONS;

  return env;
}

const DEV_ENV = sanitizeDebugEnv(process.env);

// 启动监控脚本
const watchScript = path.join(__dirname, 'watch-main.js');
console.log('[start-dev] 启动监控脚本:', watchScript);
const watchProcess = spawn('node', [watchScript], {
  detached: true,
  stdio: 'ignore',
  env: DEV_ENV
});
watchProcess.unref();
console.log('[start-dev] 监控脚本已启动');

// 等待一小段时间确保监控脚本启动
setTimeout(() => {
  // 启动 electron-vite
  const env = { ...DEV_ENV };
  if (!env.PIDS_DEV_SERVER_PORT) env.PIDS_DEV_SERVER_PORT = '5180';
  // 默认不强制开启 inspect；需要时手动设置 METRO_PIDS_DEV_DEBUG_ATTACH=1 或 VITE_ELECTRON_INSPECT
  // 渲染进程调试（DevTools 协议端口），用于附加 pwa-chrome/msedge
  if (!env.VITE_REMOTE_DEBUGGING_PORT) env.VITE_REMOTE_DEBUGGING_PORT = '9222';
  // 开发环境下静默 Electron 安全提示（例如 Insecure Content-Security-Policy）
  // 仅隐藏提示，不改变实际安全策略；生产包仍按默认行为。
  if (!env.ELECTRON_DISABLE_SECURITY_WARNINGS) env.ELECTRON_DISABLE_SECURITY_WARNINGS = 'true';
  // 自动打开开发者工具
  if (!env.METRO_PIDS_AUTO_OPEN_DEVTOOLS) env.METRO_PIDS_AUTO_OPEN_DEVTOOLS = '1';
  
  console.log('[start-dev] 启动 electron-vite');
  console.log('[start-dev] 环境变量:');
  console.log('[start-dev]   PIDS_DEV_SERVER_PORT:', env.PIDS_DEV_SERVER_PORT);
  console.log('[start-dev]   VITE_REMOTE_DEBUGGING_PORT:', env.VITE_REMOTE_DEBUGGING_PORT);
  console.log('[start-dev]   ELECTRON_DISABLE_SECURITY_WARNINGS:', env.ELECTRON_DISABLE_SECURITY_WARNINGS);
  console.log('[start-dev]   METRO_PIDS_AUTO_OPEN_DEVTOOLS:', env.METRO_PIDS_AUTO_OPEN_DEVTOOLS);

  // Windows 终端默认代码页可能不是 UTF-8，导致中文日志乱码（如“鏃ュ織...”）。
  // 在开发启动前强制切到 65001，保证主进程/渲染进程日志可读。
  const isWindows = process.platform === 'win32';
  const devCommand = isWindows
    ? 'chcp 65001>nul && npx electron-vite dev'
    : 'npx electron-vite dev';
  const electronVite = spawn(devCommand, {
    stdio: 'inherit',
    env,
    shell: true
  });

  electronVite.on('exit', (code) => {
    console.log('[start-dev] electron-vite 退出，代码:', code);
    process.exit(code || 0);
  });

  electronVite.on('error', (error) => {
    console.error('[start-dev] electron-vite 启动失败:', error);
    process.exit(1);
  });

  // 处理退出信号
  process.on('SIGINT', () => {
    console.log('[start-dev] 收到 SIGINT 信号，终止进程');
    electronVite.kill('SIGINT');
    process.exit(0);
  });

  process.on('SIGTERM', () => {
    console.log('[start-dev] 收到 SIGTERM 信号，终止进程');
    electronVite.kill('SIGTERM');
    process.exit(0);
  });
}, 200);

