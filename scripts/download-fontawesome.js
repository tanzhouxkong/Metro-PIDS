const https = require('https');
const fs = require('fs');
const path = require('path');

const FONTAWESOME_VERSION = '6.4.0';
const BASE_URL = `https://cdnjs.cloudflare.com/ajax/libs/font-awesome/${FONTAWESOME_VERSION}`;
const ASSETS_DIR = path.resolve(__dirname, '../assets/fontawesome');

// 需要下载的文件
const filesToDownload = [
  { url: `${BASE_URL}/css/all.min.css`, localPath: 'css/all.min.css' },
  { url: `${BASE_URL}/webfonts/fa-solid-900.woff2`, localPath: 'webfonts/fa-solid-900.woff2' },
  { url: `${BASE_URL}/webfonts/fa-regular-400.woff2`, localPath: 'webfonts/fa-regular-400.woff2' },
  { url: `${BASE_URL}/webfonts/fa-brands-400.woff2`, localPath: 'webfonts/fa-brands-400.woff2' },
];

// 创建目录
function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

// 下载文件
function downloadFile(url, localPath) {
  return new Promise((resolve, reject) => {
    const fullPath = path.join(ASSETS_DIR, localPath);
    const dir = path.dirname(fullPath);
    ensureDir(dir);

    console.log(`[下载] ${url} -> ${localPath}`);
    
    const file = fs.createWriteStream(fullPath);
    
    https.get(url, (response) => {
      if (response.statusCode === 200) {
        response.pipe(file);
        file.on('finish', () => {
          file.close();
          console.log(`[完成] ${localPath}`);
          resolve();
        });
      } else if (response.statusCode === 301 || response.statusCode === 302) {
        // 处理重定向
        file.close();
        fs.unlinkSync(fullPath);
        downloadFile(response.headers.location, localPath).then(resolve).catch(reject);
      } else {
        file.close();
        fs.unlinkSync(fullPath);
        reject(new Error(`下载失败: ${response.statusCode} ${response.statusMessage}`));
      }
    }).on('error', (err) => {
      file.close();
      if (fs.existsSync(fullPath)) {
        fs.unlinkSync(fullPath);
      }
      reject(err);
    });
  });
}

// 修复 CSS 文件中的字体路径（如果需要）
// 注意：Font Awesome 的原始路径 url(../webfonts/...) 已经是正确的
// 因为 CSS 在 assets/fontawesome/css/ 目录下，字体在 assets/fontawesome/webfonts/ 目录下
// 所以 ../webfonts/ 会正确解析到 assets/fontawesome/webfonts/
function fixFontPaths() {
  const cssPath = path.join(ASSETS_DIR, 'css/all.min.css');
  if (fs.existsSync(cssPath)) {
    let css = fs.readFileSync(cssPath, 'utf8');
    // 如果之前错误地修改了路径，需要恢复
    // 将错误的 url(../fontawesome/webfonts/...) 改回正确的 url(../webfonts/...)
    if (css.includes('../fontawesome/webfonts/')) {
      css = css.replace(/url\(\.\.\/fontawesome\/webfonts\//g, 'url(../webfonts/');
      fs.writeFileSync(cssPath, css, 'utf8');
      console.log('[修复] CSS 字体路径已恢复为正确路径');
    }
  }
}

// 检查文件是否已存在
function checkFilesExist() {
  const cssPath = path.join(ASSETS_DIR, 'css/all.min.css');
  const solidFont = path.join(ASSETS_DIR, 'webfonts/fa-solid-900.woff2');
  const regularFont = path.join(ASSETS_DIR, 'webfonts/fa-regular-400.woff2');
  const brandsFont = path.join(ASSETS_DIR, 'webfonts/fa-brands-400.woff2');
  
  return fs.existsSync(cssPath) && 
         fs.existsSync(solidFont) && 
         fs.existsSync(regularFont) && 
         fs.existsSync(brandsFont);
}

// 主函数
async function main() {
  // 检查是否需要强制重新下载
  const forceDownload = process.argv.includes('--force') || process.argv.includes('-f');
  
  // 检查文件是否已存在
  if (checkFilesExist() && !forceDownload) {
    console.log('✅ Font Awesome 文件已存在，跳过下载');
    console.log(`文件位置: ${ASSETS_DIR}`);
    console.log('提示: 如需重新下载，请使用 --force 参数');
    return;
  }

  if (forceDownload) {
    console.log('🔄 强制重新下载模式...');
  }

  console.log('开始下载 Font Awesome...');
  console.log(`版本: ${FONTAWESOME_VERSION}`);
  console.log(`目标目录: ${ASSETS_DIR}\n`);

  ensureDir(ASSETS_DIR);

  try {
    for (const file of filesToDownload) {
      await downloadFile(file.url, file.localPath);
    }
    
    fixFontPaths();
    
    console.log('\n✅ Font Awesome 下载完成！');
    console.log(`文件位置: ${ASSETS_DIR}`);
    console.log('\n文件结构:');
    console.log(`  ${ASSETS_DIR}/`);
    console.log(`    css/`);
    console.log(`      all.min.css`);
    console.log(`    webfonts/`);
    console.log(`      fa-solid-900.woff2`);
    console.log(`      fa-regular-400.woff2`);
    console.log(`      fa-brands-400.woff2`);
  } catch (error) {
    console.error('\n❌ 下载失败:', error.message);
    console.error('提示: 如果网络问题导致下载失败，可以手动运行: npm run download-fontawesome');
    process.exit(1);
  }
}

main();

