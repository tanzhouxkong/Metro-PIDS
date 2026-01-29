# Metro-PIDS 版本更新指南

本文档说明如何发布 Metro-PIDS 的新版本更新。

## 方式一：使用发布脚本（推荐）

### 1. 准备安装包

构建完成后，安装包通常位于 `dist` 目录：
- Windows: `Metro-PIDS-Setup-{version}.exe`
- macOS: `Metro-PIDS-{version}.dmg`
- Linux: `Metro-PIDS-{version}.AppImage`

### 2. 运行发布脚本

```bash
node scripts/publish-update.js \
  --file dist/Metro-PIDS-Setup-1.5.5.exe \
  --version 1.5.5 \
  --platform win32 \
  --arch x64
```

### 3. 完整示例

#### 发布 Windows x64 版本
```bash
node scripts/publish-update.js \
  --file dist/Metro-PIDS-Setup-1.5.5.exe \
  --version 1.5.5 \
  --platform win32 \
  --arch x64 \
  --minimum-version 1.5.0 \
  --changelog-title "版本 1.5.5" \
  --changelog-content "### 新功能\n- 添加了云控更新功能\n- 改进了更新日志显示\n\n### 修复\n- 修复了若干已知问题"
```

#### 发布 macOS ARM64 版本
```bash
node scripts/publish-update.js \
  --file dist/Metro-PIDS-1.5.5-arm64.dmg \
  --version 1.5.5 \
  --platform darwin \
  --arch arm64
```

### 4. 脚本参数说明

| 参数 | 必需 | 说明 | 示例 |
|------|------|------|------|
| `--file` | 是 | 安装包文件路径 | `dist/Metro-PIDS-Setup-1.5.5.exe` |
| `--version` | 是 | 版本号 | `1.5.5` |
| `--platform` | 否 | 平台（默认 win32） | `win32`, `darwin`, `linux` |
| `--arch` | 否 | 架构（默认 x64） | `x64`, `arm64` |
| `--api` | 否 | API 地址 | `https://metro.tanzhouxiang.dpdns.org` |
| `--token` | 否 | 认证令牌 | 或设置环境变量 `CLOUD_TOKEN` |
| `--minimum-version` | 否 | 最低要求版本 | `1.5.0` |
| `--force-update` | 否 | 强制所有版本更新 | 无需参数值 |
| `--changelog-title` | 否 | 更新日志标题 | `版本 1.5.5` |
| `--changelog-content` | 否 | 更新日志内容（支持 Markdown） | 见上方示例 |

### 5. 设置认证令牌

为了安全上传版本信息，可以设置环境变量：

**Windows (PowerShell):**
```powershell
$env:CLOUD_TOKEN="your-token-here"
node scripts/publish-update.js --file dist/Metro-PIDS-Setup-1.5.5.exe --version 1.5.5
```

**macOS/Linux:**
```bash
export CLOUD_TOKEN="your-token-here"
node scripts/publish-update.js --file dist/Metro-PIDS-Setup-1.5.5.exe --version 1.5.5
```

---

## 方式二：使用后台管理界面

### 1. 访问后台

打开浏览器，访问 Cloudflare Pages 部署的管理后台：
```
https://your-admin-page.pages.dev
```

### 2. 进入"版本更新"标签

点击顶部的"版本更新"标签页。

### 3. 生成版本信息

1. **选择安装包文件**
   - 点击"选择安装包文件"按钮
   - 选择构建好的安装包（.exe, .dmg, .AppImage 等）
   - 系统会自动计算 SHA512 哈希值和文件大小

2. **填写版本信息**
   - 版本号：如 `1.5.5`
   - 平台/架构：选择对应的平台（如 Windows x64）
   - 最低要求版本（可选）：如 `1.5.0`（低于此版本的客户端将被强制更新）
   - 强制更新（可选）：勾选后所有版本都必须更新

3. **生成版本信息**
   - 点击"生成版本信息"按钮
   - 系统会自动填充版本信息 JSON

4. **上传到服务器**
   - 确认版本信息 JSON 无误
   - 点击"上传到服务器"按钮
   - 等待上传成功提示

### 4. 添加更新日志（可选）

1. 点击"下载更新日志"按钮获取现有日志
2. 编辑更新日志 JSON，添加新版本条目：
   ```json
   [
     {
       "version": "1.5.5",
       "title": "版本 1.5.5",
       "content": "### 新功能\n- 添加了云控更新功能\n- 改进了更新日志显示",
       "releaseDate": "2025-01-16T12:00:00.000Z",
       "prerelease": false
     }
   ]
   ```
3. 点击"上传更新日志"按钮

---

## 完整发布流程

### 1. 构建应用

```bash
# 安装依赖
npm install

# 构建应用（Windows）
npm run build:win

# 构建应用（macOS）
npm run build:mac

# 构建应用（Linux）
npm run build:linux
```

### 2. 测试安装包

在目标平台上测试安装包是否正常工作。

### 3. 上传安装包到 CDN

将安装包上传到 CDN 或 Cloudflare R2，确保下载链接可访问：
```
https://metro.tanzhouxiang.dpdns.org/update/Metro-PIDS-Setup-1.5.5.exe
```

### 4. 发布版本信息

使用上述任一方式发布版本信息到 Cloudflare Worker。

### 5. 验证更新

1. 启动旧版本的 Metro-PIDS 客户端
2. 客户端应该自动检测到新版本
3. 点击更新按钮，确认可以下载和安装新版本

---

## 强制更新说明

### 什么是强制更新？

强制更新有两种方式：

1. **设置最低要求版本（minimumVersion）**
   - 低于最低版本的客户端必须更新
   - 例如：设置 `minimumVersion: "1.5.0"`，则所有 1.4.x 及以下版本必须更新

2. **设置强制更新标记（forceUpdate）**
   - 所有版本都必须更新到最新版本
   - 适用于重大安全更新或关键 bug 修复

### 如何设置强制更新？

**使用脚本：**
```bash
node scripts/publish-update.js \
  --file dist/Metro-PIDS-Setup-1.5.5.exe \
  --version 1.5.5 \
  --minimum-version 1.5.0  # 或使用 --force-update
```

**使用后台：**
- 在"最低要求版本"字段填写版本号（如 `1.5.0`）
- 或勾选"强制所有版本更新"复选框

### 强制更新的用户体验

- 客户端会显示正常的更新提示对话框
- 更新信息中会包含 `forceUpdate` 标记
- 前端可以根据此标记禁用"跳过"或"稍后提醒"按钮
- 用户必须完成更新才能继续使用应用

---

## 更新日志格式

更新日志支持 Markdown 格式：

```json
{
  "version": "1.5.5",
  "title": "版本 1.5.5 - 云控更新",
  "content": "### 新功能\n- 添加了云控更新功能\n- 改进了更新日志显示\n- 支持强制更新机制\n\n### 改进\n- 优化了启动速度\n- 改进了错误提示\n\n### 修复\n- 修复了显示端偶尔黑屏的问题\n- 修复了线路切换时的崩溃问题",
  "releaseDate": "2025-01-16T12:00:00.000Z",
  "prerelease": false
}
```

---

## 常见问题

### Q1: 如何回滚版本？
A: 上传旧版本的版本信息即可，客户端会检测到版本号变化。

### Q2: 如何测试更新功能？
A: 在本地运行 `scripts/local-update-server.js`，并在客户端设置中将更新源改为本地服务器。

### Q3: 更新文件存储在哪里？
A: 版本信息存储在 Cloudflare KV，安装包文件需要上传到 CDN 或 Cloudflare R2。

### Q4: 如何查看当前发布的版本？
A: 在后台管理界面点击"下载版本信息"按钮，或访问 API：
```
https://metro.tanzhouxiang.dpdns.org/update/check?platform=win32&arch=x64&version=0.0.0
```

---

## 技术细节

### 版本信息存储

版本信息存储在 Cloudflare KV 中，键名格式：
```
update:win32:x64
update:darwin:arm64
update:linux:x64
```

### 更新日志存储

更新日志存储在 Cloudflare KV 中，键名：
```
update:changelog
```

### SHA512 计算

脚本使用 Node.js 的 `crypto` 模块计算 SHA512：
```javascript
const hash = crypto.createHash('sha512');
const stream = fs.createReadStream(filePath);
stream.on('data', (chunk) => hash.update(chunk));
stream.on('end', () => resolve(hash.digest('base64')));
```

浏览器端使用 Web Crypto API：
```javascript
const buffer = await file.arrayBuffer();
const hashBuffer = await crypto.subtle.digest('SHA-512', buffer);
const hashBase64 = btoa(String.fromCharCode.apply(null, new Uint8Array(hashBuffer)));
```
