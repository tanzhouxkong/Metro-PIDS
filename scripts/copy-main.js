const fs = require('fs');
const path = require('path');

// 确保 out/main 目录存在
const outDir = path.join(__dirname, '..', 'out', 'main');
if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
}

// 复制 main.js 到 out/main/main.js
const source = path.join(__dirname, '..', 'main.js');
const target = path.join(outDir, 'main.js');

// 同时复制解耦出来的主进程模块目录：main/ -> out/main/main/
const sourceMainDir = path.join(__dirname, '..', 'main');
const targetMainDir = path.join(outDir, 'main');

if (fs.existsSync(source)) {
  // 总是复制，确保文件存在
  fs.copyFileSync(source, target);
  console.log('[copy-main] ✅ Copied main.js to out/main/main.js');

  // 复制 main/ 目录（BrowserView Manager / Effects Manager 等）
  if (fs.existsSync(sourceMainDir)) {
    try {
      fs.cpSync(sourceMainDir, targetMainDir, { recursive: true, force: true });
      console.log('[copy-main] ✅ Copied main/ to out/main/main/');
    } catch (e) {
      console.error('[copy-main] ❌ Failed to copy main/ directory:', e);
      process.exit(1);
    }
  } else {
    console.warn('[copy-main] ⚠️ main/ directory not found at:', sourceMainDir);
  }
  
  // 验证文件存在
  if (fs.existsSync(target)) {
    const stat = fs.statSync(target);
    console.log('[copy-main] ✅ File verified, size:', stat.size, 'bytes');
  } else {
    console.error('[copy-main] ❌ File copy failed!');
    process.exit(1);
  }
} else {
  console.error('[copy-main] ❌ main.js not found at:', source);
  process.exit(1);
}
