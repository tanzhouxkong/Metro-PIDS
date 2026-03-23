const fs = require('fs');
const path = require('path');

console.log('=== mica-electron 诊断工具 ===\n');

// 1. 检查 package.json
console.log('1. 检查 package.json...');
try {
  const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
  if (pkg.dependencies && pkg.dependencies['mica-electron']) {
    console.log(`   ✅ mica-electron 版本: ${pkg.dependencies['mica-electron']}`);
  } else {
    console.log('   ❌ package.json 中未找到 mica-electron');
  }
} catch (e) {
  console.log('   ❌ 无法读取 package.json:', e.message);
}

// 2. 检查 node_modules
console.log('\n2. 检查 node_modules...');
const micaPath = path.join(__dirname, '..', 'node_modules', 'mica-electron');
if (fs.existsSync(micaPath)) {
  console.log('   ✅ node_modules/mica-electron 存在');
  
  // 检查 package.json
  const micaPkgPath = path.join(micaPath, 'package.json');
  if (fs.existsSync(micaPkgPath)) {
    try {
      const micaPkg = JSON.parse(fs.readFileSync(micaPkgPath, 'utf8'));
      console.log(`   ✅ mica-electron 版本: ${micaPkg.version}`);
    } catch (e) {
      console.log('   ⚠️ 无法读取 mica-electron 的 package.json');
    }
  }
} else {
  console.log('   ❌ node_modules/mica-electron 不存在');
  console.log('   💡 请运行: npm install mica-electron');
  process.exit(1);
}

// 3. 检查原生模块
console.log('\n3. 检查原生模块...');
const arch = process.arch;
const srcPath = path.join(micaPath, 'src');
const nodeFile = path.join(srcPath, `micaElectron_${arch}.node`);

if (fs.existsSync(nodeFile)) {
  console.log(`   ✅ 原生模块存在: micaElectron_${arch}.node`);
  const stats = fs.statSync(nodeFile);
  console.log(`   📦 文件大小: ${(stats.size / 1024).toFixed(2)} KB`);
} else {
  console.log(`   ❌ 原生模块不存在: micaElectron_${arch}.node`);
  console.log(`   📁 检查路径: ${srcPath}`);
  if (fs.existsSync(srcPath)) {
    const files = fs.readdirSync(srcPath);
    console.log(`   📋 目录中的文件: ${files.join(', ')}`);
  } else {
    console.log('   ❌ src 目录不存在');
  }
  console.log('   💡 需要重新编译，请运行: npm install --build-from-source mica-electron');
}

// 4. 尝试加载模块
console.log('\n4. 尝试加载 mica-electron 模块...');
try {
  const mica = require('mica-electron');
  console.log('   ✅ 模块加载成功');
  
  if (mica.MicaBrowserWindow) {
    console.log('   ✅ MicaBrowserWindow 可用');
    console.log(`   📝 类型: ${typeof mica.MicaBrowserWindow}`);
  } else {
    console.log('   ❌ MicaBrowserWindow 不可用');
  }
  
  if (mica.IS_WINDOWS_11 !== undefined) {
    console.log(`   ✅ IS_WINDOWS_11: ${mica.IS_WINDOWS_11}`);
  } else {
    console.log('   ⚠️ IS_WINDOWS_11 未定义');
  }
  
  if (mica.WIN10 !== undefined) {
    console.log(`   ✅ WIN10: ${mica.WIN10 ? '可用' : '不可用'}`);
  } else {
    console.log('   ⚠️ WIN10 未定义');
  }
  
  // 列出所有导出的属性
  console.log('\n   📋 模块导出的所有属性:');
  Object.keys(mica).forEach(key => {
    console.log(`      - ${key}: ${typeof mica[key]}`);
  });
  
} catch (e) {
  console.log('   ❌ 模块加载失败');
  console.log(`   📝 错误信息: ${e.message}`);
  console.log(`   📝 错误堆栈: ${e.stack}`);
  if (e.code === 'MODULE_NOT_FOUND') {
    console.log('   💡 请运行: npm install mica-electron');
  } else if (e.message.includes('Cannot find module') || e.message.includes('micaElectron')) {
    console.log('   💡 原生模块未编译，请运行: npm install --build-from-source mica-electron');
  }
}

console.log('\n=== 诊断完成 ===');

