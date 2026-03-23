#!/usr/bin/env node
/**
 * 清理 Vite 依赖预构建缓存
 * 当遇到模块加载错误（如 Vue 500 错误）时运行此脚本
 */

const fs = require('fs');
const path = require('path');

const viteCacheDir = path.join(process.cwd(), 'node_modules', '.vite');
const outDir = path.join(process.cwd(), 'out');

console.log('🧹 开始清理 Vite 缓存...\n');

// 清理 Vite 预构建缓存
if (fs.existsSync(viteCacheDir)) {
  try {
    fs.rmSync(viteCacheDir, { recursive: true, force: true });
    console.log('✅ Vite 预构建缓存已清理:', viteCacheDir);
  } catch (e) {
    console.error('❌ 清理 Vite 缓存失败:', e.message);
  }
} else {
  console.log('ℹ️  Vite 缓存目录不存在:', viteCacheDir);
}

// 可选：清理构建输出目录
const cleanOut = process.argv.includes('--clean-out');
if (cleanOut && fs.existsSync(outDir)) {
  try {
    fs.rmSync(outDir, { recursive: true, force: true });
    console.log('✅ 构建输出目录已清理:', outDir);
  } catch (e) {
    console.error('❌ 清理构建输出目录失败:', e.message);
  }
}

console.log('\n✨ 清理完成！请重新运行 `npm run dev` 启动开发服务器。');
console.log('💡 提示：如果问题仍然存在，请尝试：');
console.log('   1. 删除 node_modules 目录并重新运行 npm install');
console.log('   2. 检查网络连接（Vite 需要下载依赖）');
console.log('   3. 检查防火墙设置（端口 5173 需要可用）');

