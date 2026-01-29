const fs = require('fs');
const path = require('path');

// 确保 Electron 主进程入口文件存在，避免 electron-vite 在 dev 模式下报 "No electron app entry file found"
// 这里创建一个最小的 dist/main/index.js，简单地 require 根目录下的 main.js

const distMainDir = path.join(__dirname, '..', 'dist', 'main');
const entryFile = path.join(distMainDir, 'index.js');

try {
  fs.mkdirSync(distMainDir, { recursive: true });
  if (!fs.existsSync(entryFile)) {
    fs.writeFileSync(
      entryFile,
      "require('../../main.js');\n",
      'utf8'
    );
  }
} catch (e) {
  // 开发辅助脚本，出错时静默失败，避免影响后续 electron-vite dev 执行
}


