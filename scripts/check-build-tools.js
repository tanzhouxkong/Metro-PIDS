const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

console.log('检查 Visual Studio Build Tools 安装状态...\n');

// 检查 Visual Studio Build Tools 路径
const vsPaths = [
  'C:\\Program Files (x86)\\Microsoft Visual Studio\\2022\\BuildTools',
  'C:\\Program Files\\Microsoft Visual Studio\\2022\\BuildTools',
  'C:\\Program Files (x86)\\Microsoft Visual Studio\\2022\\Community',
  'C:\\Program Files\\Microsoft Visual Studio\\2022\\Community'
];

let vsFound = false;
for (const vsPath of vsPaths) {
  if (fs.existsSync(vsPath)) {
    console.log(`✅ 找到 Visual Studio: ${vsPath}`);
    vsFound = true;
    
    // 检查 MSVC 工具
    const vcToolsPath = path.join(vsPath, 'VC', 'Tools', 'MSVC');
    if (fs.existsSync(vcToolsPath)) {
      const versions = fs.readdirSync(vcToolsPath);
      console.log(`   MSVC 版本: ${versions.join(', ')}`);
    }
    
    // 检查 Windows SDK
    const sdkPath = 'C:\\Program Files (x86)\\Windows Kits\\10';
    if (fs.existsSync(sdkPath)) {
      const versions = fs.readdirSync(sdkPath).filter(v => v.startsWith('10.'));
      console.log(`   Windows SDK 版本: ${versions.join(', ')}`);
    }
    break;
  }
}

if (!vsFound) {
  console.log('❌ 未找到 Visual Studio Build Tools');
  console.log('\n请按照以下步骤安装：');
  console.log('1. 访问 https://visualstudio.microsoft.com/zh-hans/downloads/');
  console.log('2. 下载 "Visual Studio 生成工具"');
  console.log('3. 安装时选择 "C++ 生成工具" 工作负载');
  console.log('4. 确保勾选 Windows 10 SDK');
}

// 检查 node-gyp
console.log('\n检查 node-gyp...');
try {
  const version = execSync('node-gyp --version', { encoding: 'utf-8' }).trim();
  console.log(`✅ node-gyp 已安装: ${version}`);
} catch (e) {
  console.log('❌ node-gyp 未安装');
  console.log('   运行: npm install -g node-gyp');
}

// 检查 mica-electron 原生模块
console.log('\n检查 mica-electron 原生模块...');
const micaElectronPath = path.join(__dirname, '..', 'node_modules', 'mica-electron', 'src');
const arch = process.arch;
const nodeFile = path.join(micaElectronPath, `micaElectron_${arch}.node`);

if (fs.existsSync(nodeFile)) {
  const stats = fs.statSync(nodeFile);
  console.log(`✅ 原生模块文件存在: ${nodeFile}`);
  console.log(`   文件大小: ${(stats.size / 1024).toFixed(2)} KB`);
  console.log(`   修改时间: ${stats.mtime}`);
} else {
  console.log(`❌ 原生模块文件不存在: ${nodeFile}`);
  console.log('\n需要重新编译 mica-electron：');
  console.log('   运行: npm run rebuild-mica');
}

console.log('\n检查完成！');

