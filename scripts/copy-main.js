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

if (fs.existsSync(source)) {
  // 总是复制，确保文件存在
  fs.copyFileSync(source, target);
  console.log('[copy-main] ✅ Copied main.js to out/main/main.js');
  
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
