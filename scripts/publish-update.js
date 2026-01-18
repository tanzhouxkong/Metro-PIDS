/**
 * Metro-PIDS 版本更新发布脚本
 * 
 * 功能：
 * 1. 计算安装包文件的 SHA512 和文件大小
 * 2. 生成版本信息 JSON
 * 3. 上传版本信息到 Cloudflare Worker
 * 4. 可选：生成更新日志条目
 * 
 * 使用方法：
 * node scripts/publish-update.js --file <安装包路径> --version <版本号> --platform <平台> --arch <架构>
 * 
 * 示例：
 * node scripts/publish-update.js --file dist/Metro-PIDS-Setup-1.5.5.exe --version 1.5.5 --platform win32 --arch x64
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const https = require('https');

// 解析命令行参数
function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    file: null,
    version: null,
    platform: 'win32',
    arch: 'x64',
    apiBase: 'https://metro.tanzhouxiang.dpdns.org',
    token: process.env.CLOUD_TOKEN || '',
    minimumVersion: null,
    forceUpdate: false,
    changelogTitle: null,
    changelogContent: null
  };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--file':
        options.file = args[++i];
        break;
      case '--version':
        options.version = args[++i];
        break;
      case '--platform':
        options.platform = args[++i];
        break;
      case '--arch':
        options.arch = args[++i];
        break;
      case '--api':
        options.apiBase = args[++i];
        break;
      case '--token':
        options.token = args[++i];
        break;
      case '--minimum-version':
        options.minimumVersion = args[++i];
        break;
      case '--force-update':
        options.forceUpdate = true;
        break;
      case '--changelog-title':
        options.changelogTitle = args[++i];
        break;
      case '--changelog-content':
        options.changelogContent = args[++i];
        break;
      case '--help':
        printHelp();
        process.exit(0);
        break;
    }
  }

  return options;
}

function printHelp() {
  console.log(`
Metro-PIDS 版本更新发布脚本

使用方法：
  node scripts/publish-update.js [选项]

必需参数：
  --file <路径>              安装包文件路径
  --version <版本号>         版本号（如 1.5.5）

可选参数：
  --platform <平台>          平台（win32/darwin/linux，默认：win32）
  --arch <架构>              架构（x64/arm64，默认：x64）
  --api <地址>               API 地址（默认：https://metro.tanzhouxiang.dpdns.org）
  --token <令牌>             认证令牌（或设置环境变量 CLOUD_TOKEN）
  --minimum-version <版本>   最低要求版本（低于此版本的客户端将强制更新）
  --force-update             设置为强制更新（所有版本必须更新）
  --changelog-title <标题>   更新日志标题
  --changelog-content <内容> 更新日志内容（支持 Markdown）
  --help                     显示此帮助信息

示例：
  # 基本用法
  node scripts/publish-update.js --file dist/Metro-PIDS-Setup-1.5.5.exe --version 1.5.5

  # 设置强制更新
  node scripts/publish-update.js --file dist/Metro-PIDS-Setup-1.5.5.exe --version 1.5.5 --minimum-version 1.5.0

  # 添加更新日志
  node scripts/publish-update.js --file dist/Metro-PIDS-Setup-1.5.5.exe --version 1.5.5 \\
    --changelog-title "版本 1.5.5" \\
    --changelog-content "### 新功能\\n- 添加了云控更新\\n- 改进了UI"
  `);
}

// 计算文件 SHA512
function calculateSHA512(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha512');
    const stream = fs.createReadStream(filePath);

    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('base64')));
    stream.on('error', reject);
  });
}

// 获取文件大小
function getFileSize(filePath) {
  const stats = fs.statSync(filePath);
  return stats.size;
}

// 上传版本信息到 Cloudflare Worker
function uploadVersionInfo(apiBase, token, platform, arch, versionInfo) {
  return new Promise((resolve, reject) => {
    const url = new URL(`/update/info?platform=${platform}&arch=${arch}`, apiBase);
    const data = JSON.stringify(versionInfo);

    const options = {
      hostname: url.hostname,
      port: url.port || 443,
      path: url.pathname + url.search,
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data),
        'Accept': 'application/json'
      }
    };

    if (token) {
      options.headers['Authorization'] = `Bearer ${token}`;
    }

    const req = https.request(options, (res) => {
      let responseData = '';

      res.on('data', (chunk) => {
        responseData += chunk;
      });

      res.on('end', () => {
        try {
          const result = JSON.parse(responseData);
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(result);
          } else {
            reject(new Error(`上传失败 (${res.statusCode}): ${result.error || responseData}`));
          }
        } catch (e) {
          reject(new Error(`解析响应失败: ${e.message}`));
        }
      });
    });

    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

// 上传更新日志
function uploadChangelog(apiBase, token, changelog) {
  return new Promise((resolve, reject) => {
    const url = new URL('/update/changelog', apiBase);
    const data = JSON.stringify({ changelog });

    const options = {
      hostname: url.hostname,
      port: url.port || 443,
      path: url.pathname,
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data),
        'Accept': 'application/json'
      }
    };

    if (token) {
      options.headers['Authorization'] = `Bearer ${token}`;
    }

    const req = https.request(options, (res) => {
      let responseData = '';

      res.on('data', (chunk) => {
        responseData += chunk;
      });

      res.on('end', () => {
        try {
          const result = JSON.parse(responseData);
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(result);
          } else {
            reject(new Error(`上传失败 (${res.statusCode}): ${result.error || responseData}`));
          }
        } catch (e) {
          reject(new Error(`解析响应失败: ${e.message}`));
        }
      });
    });

    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

// 获取现有更新日志
function getChangelog(apiBase) {
  return new Promise((resolve, reject) => {
    const url = new URL('/update/changelog', apiBase);

    const options = {
      hostname: url.hostname,
      port: url.port || 443,
      path: url.pathname,
      method: 'GET',
      headers: {
        'Accept': 'application/json'
      }
    };

    https.get(options, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        try {
          const result = JSON.parse(data);
          resolve(result.changelog || []);
        } catch (e) {
          resolve([]);
        }
      });
    }).on('error', () => {
      resolve([]);
    });
  });
}

// 主函数
async function main() {
  const options = parseArgs();

  // 验证必需参数
  if (!options.file) {
    console.error('❌ 错误：缺少 --file 参数');
    console.log('使用 --help 查看帮助信息');
    process.exit(1);
  }

  if (!options.version) {
    console.error('❌ 错误：缺少 --version 参数');
    console.log('使用 --help 查看帮助信息');
    process.exit(1);
  }

  // 检查文件是否存在
  if (!fs.existsSync(options.file)) {
    console.error(`❌ 错误：文件不存在: ${options.file}`);
    process.exit(1);
  }

  console.log('🚀 Metro-PIDS 版本更新发布脚本');
  console.log('━'.repeat(50));
  console.log(`📦 文件: ${options.file}`);
  console.log(`📌 版本: ${options.version}`);
  console.log(`💻 平台: ${options.platform} (${options.arch})`);
  console.log(`🌐 API: ${options.apiBase}`);
  console.log('');

  try {
    // 1. 计算文件信息
    console.log('📊 正在计算文件信息...');
    const sha512 = await calculateSHA512(options.file);
    const size = getFileSize(options.file);
    const filename = path.basename(options.file);

    console.log(`  ✓ SHA512: ${sha512.substring(0, 32)}...`);
    console.log(`  ✓ 文件大小: ${(size / 1024 / 1024).toFixed(2)} MB`);
    console.log('');

    // 2. 生成版本信息
    const versionInfo = {
      version: options.version,
      filename: filename,
      path: filename,
      sha512: sha512,
      size: size,
      releaseDate: new Date().toISOString(),
      platform: options.platform,
      arch: options.arch
    };

    if (options.minimumVersion) {
      versionInfo.minimumVersion = options.minimumVersion;
    }

    if (options.forceUpdate) {
      versionInfo.forceUpdate = true;
    }

    console.log('📝 版本信息:');
    console.log(JSON.stringify(versionInfo, null, 2));
    console.log('');

    // 3. 上传版本信息
    console.log('⬆️  正在上传版本信息到 Cloudflare Worker...');
    const uploadResult = await uploadVersionInfo(
      options.apiBase,
      options.token,
      options.platform,
      options.arch,
      versionInfo
    );
    console.log('  ✓ 版本信息上传成功');
    console.log('');

    // 4. 处理更新日志（如果提供）
    if (options.changelogTitle || options.changelogContent) {
      console.log('📖 正在处理更新日志...');
      
      // 获取现有更新日志
      const existingChangelog = await getChangelog(options.apiBase);
      
      // 检查是否已存在该版本的更新日志
      const existingIndex = existingChangelog.findIndex(c => c.version === options.version);
      
      const changelogEntry = {
        version: options.version,
        title: options.changelogTitle || `版本 ${options.version}`,
        content: options.changelogContent || '更新内容',
        releaseDate: new Date().toISOString(),
        prerelease: false
      };

      if (existingIndex >= 0) {
        // 更新现有条目
        existingChangelog[existingIndex] = changelogEntry;
        console.log('  ℹ️  更新现有更新日志条目');
      } else {
        // 添加新条目（插入到开头）
        existingChangelog.unshift(changelogEntry);
        console.log('  ℹ️  添加新更新日志条目');
      }

      // 上传更新日志
      await uploadChangelog(options.apiBase, options.token, existingChangelog);
      console.log('  ✓ 更新日志上传成功');
      console.log('');
    }

    // 5. 显示成功信息
    console.log('━'.repeat(50));
    console.log('✅ 版本更新发布完成！');
    console.log('');
    console.log('📋 后续步骤：');
    console.log(`  1. 将安装包文件上传到 CDN 或 R2 存储`);
    console.log(`  2. 确保下载地址可访问: ${options.apiBase}/update/${filename}`);
    console.log(`  3. 在后台管理界面验证版本信息`);
    console.log('');

  } catch (error) {
    console.error('');
    console.error('❌ 发布失败:', error.message);
    console.error('');
    if (error.stack) {
      console.error('错误堆栈:', error.stack);
    }
    process.exit(1);
  }
}

// 运行主函数
main().catch((error) => {
  console.error('未捕获的错误:', error);
  process.exit(1);
});
