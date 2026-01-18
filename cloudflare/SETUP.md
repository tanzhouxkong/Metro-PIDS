# Cloudflare Worker 部署指南

## 快速开始

### 1. 安装 Wrangler CLI

```bash
npm install -g wrangler
```

### 2. 登录 Cloudflare

```bash
wrangler login
```

### 3. 创建 KV Namespaces

```bash
# 创建预设线路 KV（如果还没有）
wrangler kv:namespace create METRO_PIDS_LINES

# 创建配置 KV（用于运控线路、彩蛋、节日配置）
wrangler kv:namespace create METRO_PIDS_CONFIG
```

### 4. 更新 wrangler.toml

将创建 KV namespace 时返回的 ID 填入 `wrangler.toml`：

```toml
[[kv_namespaces]]
binding = "LINES"
id = "你的_LINES_命名空间_ID"

[[kv_namespaces]]
binding = "CONFIG"
id = "你的_CONFIG_命名空间_ID"
```

### 5. 配置 Token（可选但推荐）

在 `wrangler.toml` 中设置 `CLOUD_TOKEN` 以保护写操作：

```toml
[vars]
CLOUD_TOKEN = "你的安全token（建议使用随机字符串）"
```

### 6. 部署

```bash
cd cloudflare
wrangler deploy
```

部署成功后，你会得到一个 Worker URL，例如：`https://metro-pids-cloud.your-subdomain.workers.dev`

## 方案 B：部署新版管理后台（Cloudflare Pages）

你现在的云控 API Base 是：

- `https://metro.tanzhouxiang.dpdns.org`

### 1) 新建 Pages 项目

Cloudflare 控制台 → **Pages** → Create a project → 选择 **Direct Upload**（最简单）。

### 2) 上传 `admin.html`

把项目里的 `cloudflare/admin.html` 上传到 Pages。

- **建议**：上传时改名为 `index.html`（这样打开域名根路径就是后台首页）

### 3) 给 Pages 绑定域名（推荐）

例如绑定到：`admin.tanzhouxiang.dpdns.org`

### 4) 让 Worker 的 `/admin-v2` 指向新版后台

在 `cloudflare/wrangler.toml` 里设置：

```toml
[vars]
ADMIN_UI_URL = "https://admin.tanzhouxiang.dpdns.org"
```

然后重新部署 Worker：

```bash
wrangler deploy
```

完成后你就可以用同域名入口打开新版后台：

- `https://metro.tanzhouxiang.dpdns.org/admin-v2`（会跳到 Pages 后台）

## 在应用中使用

### 配置云控 API 地址

在应用的开发者工具或设置中配置：

```javascript
// 设置云控 API 地址
localStorage.setItem('cloudLinesApiBase', 'https://metro.tanzhouxiang.dpdns.org');
localStorage.setItem('cloudLinesProvider', 'api');

// 如果设置了 CLOUD_TOKEN，也需要配置
localStorage.setItem('cloudLinesAuthToken', '你的token');
```

### 访问管理界面

打开浏览器访问：`https://metro.tanzhouxiang.dpdns.org/admin`

（可选）`https://metro.tanzhouxiang.dpdns.org/admin-v2` 会自动跳转到 `/admin`

## API 接口说明

### 预设线路 API

- `GET /preset` - 获取所有预设线路
- `GET /preset/:lineName` - 获取单个预设线路
- `POST /preset` - 创建预设线路（需要 Token）
- `PUT /preset/:lineName` - 更新预设线路（需要 Token）
- `DELETE /preset/:lineName` - 删除预设线路（需要 Token）

### 运控更新线路 API

- `GET /runtime/lines` - 获取所有运控线路
- `GET /runtime/lines/:lineName` - 获取单个运控线路
- `PUT /runtime/lines/:lineName` - 更新/创建运控线路（需要 Token）
- `DELETE /runtime/lines/:lineName` - 删除运控线路（需要 Token）

### 彩蛋配置 API

- `GET /easter-eggs` - 获取彩蛋配置
- `PUT /easter-eggs` - 更新彩蛋配置（需要 Token）

### 更新日志和安装包 API

- `GET /releases` - 获取 Releases 列表（最多10个最新版本）
- `GET /releases/latest` - 获取最新版本信息（用于更新检查）
- `GET /releases/download/:tag/:file` - 代理安装包下载（301重定向到GitHub）

**配置格式：**
```json
{
  "stations": ["经十路", "经十东路", "经十西路", "千佛山", "华洋名苑"],
  "messages": [
    "人生路漫漫 白鹭常相伴。",
    "今人不见古时月 今月曾经照古人。"
  ],
  "enabled": true
}
```

### 节日配置 API

- `GET /holidays` - 获取所有节日配置
- `PUT /holidays` - 更新节日配置（需要 Token）
- `GET /holidays/active` - 获取当前激活的节日

**配置格式：**
```json
{
  "birthday": {
    "enabled": true,
    "date": { "month": 2, "day": 21 },
    "messages": ["🎂 生日快乐！", "祝开发者生日快乐！"],
    "ui": {
      "showButton": true,
      "buttonIcon": "🎂",
      "buttonColor": "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
      "showMenu": true
    }
  },
  "chineseNewYear": {
    "enabled": true,
    "duration": 14,
    "messages": ["🎉 新年快乐！", "🧧 恭喜发财！"],
    "ui": {
      "showButton": true,
      "buttonIcon": "🐉",
      "buttonColor": "linear-gradient(135deg, #f093fb 0%, #f5576c 100%)",
      "showMenu": true
    }
  }
}
```

### 更新日志和安装包 API

这些 API 用于从 GitHub Releases 代理获取更新日志和安装包信息，提供更快的访问速度和更好的控制。

#### 获取 Releases 列表

**接口：** `GET /releases`

**说明：** 获取 GitHub Releases 列表（最多返回前10个最新版本），包含完整的版本信息、更新日志和安装包下载链接。

**请求示例：**
```bash
curl https://metro.tanzhouxiang.dpdns.org/releases
```

**响应格式：**
```json
{
  "ok": true,
  "releases": [
    {
      "tag_name": "v1.5.6",
      "name": "v1.5.6",
      "body": "## 更新内容\n\n- 新增功能...",
      "published_at": "2024-01-15T10:30:00Z",
      "html_url": "https://github.com/tanzhouxkong/Metro-PIDS-/releases/tag/v1.5.6",
      "prerelease": false,
      "draft": false,
      "assets": [
        {
          "name": "Metro-PIDS-Setup-1.5.6.exe",
          "browser_download_url": "https://github.com/tanzhouxkong/Metro-PIDS-/releases/download/v1.5.6/Metro-PIDS-Setup-1.5.6.exe",
          "size": 125829120,
          "content_type": "application/x-msdownload",
          "download_count": 150
        },
        {
          "name": "Metro-PIDS-1.5.6.dmg",
          "browser_download_url": "https://github.com/tanzhouxkong/Metro-PIDS-/releases/download/v1.5.6/Metro-PIDS-1.5.6.dmg",
          "size": 134217728,
          "content_type": "application/x-apple-diskimage",
          "download_count": 80
        }
      ]
    }
  ]
}
```

#### 获取最新版本信息

**接口：** `GET /releases/latest`

**说明：** 获取最新的 Release 版本信息，用于更新检查。返回格式化的版本号、更新日志和安装包下载链接（包含代理下载地址）。

**请求示例：**
```bash
curl https://metro.tanzhouxiang.dpdns.org/releases/latest
```

**响应格式：**
```json
{
  "ok": true,
  "version": "1.5.6",
  "tag_name": "v1.5.6",
  "name": "v1.5.6",
  "body": "## 更新内容\n\n- 新增功能...",
  "published_at": "2024-01-15T10:30:00Z",
  "html_url": "https://github.com/tanzhouxkong/Metro-PIDS-/releases/tag/v1.5.6",
  "prerelease": false,
  "draft": false,
  "assets": [
    {
      "name": "Metro-PIDS-Setup-1.5.6.exe",
      "browser_download_url": "https://github.com/tanzhouxkong/Metro-PIDS-/releases/download/v1.5.6/Metro-PIDS-Setup-1.5.6.exe",
      "proxy_download_url": "https://metro.tanzhouxiang.dpdns.org/releases/download/v1.5.6/Metro-PIDS-Setup-1.5.6.exe",
      "size": 125829120,
      "content_type": "application/x-msdownload",
      "download_count": 150
    }
  ]
}
```

**字段说明：**
- `version`: 版本号（已移除 `v` 前缀）
- `tag_name`: 完整的标签名（包含 `v` 前缀）
- `assets`: 安装包列表
  - `browser_download_url`: GitHub 原始下载地址
  - `proxy_download_url`: 通过 Worker 代理的下载地址（推荐使用）

#### 代理安装包下载

**接口：** `GET /releases/download/:tag/:file`

**说明：** 代理安装包下载，通过 301 重定向到 GitHub 实际下载地址。可用于统一下载入口、统计下载量或未来扩展缓存功能。

**路径格式：**
```
/releases/download/{tagName}/{fileName}
```

**请求示例：**
```bash
# Windows 安装包
curl -L https://metro.tanzhouxiang.dpdns.org/releases/download/v1.5.6/Metro-PIDS-Setup-1.5.6.exe

# macOS 安装包
curl -L https://metro.tanzhouxiang.dpdns.org/releases/download/v1.5.6/Metro-PIDS-1.5.6.dmg

# Linux AppImage
curl -L https://metro.tanzhouxiang.dpdns.org/releases/download/v1.5.6/Metro-PIDS-1.5.6.AppImage
```

**响应：**
- 状态码：`301 Moved Permanently`
- 重定向到：`https://github.com/tanzhouxkong/Metro-PIDS-/releases/download/{tagName}/{fileName}`

**使用场景：**
1. **统一下载入口**：所有下载请求通过 Worker，便于管理
2. **统计下载量**：可以在 Worker 中记录下载请求（需要额外实现）
3. **CDN 加速**：未来可以扩展为从 Cloudflare R2 或缓存中提供下载
4. **访问控制**：可以添加下载权限验证（需要额外实现）

**注意事项：**
- 此接口会进行 301 永久重定向，客户端会自动跟随重定向下载
- 使用 `curl` 测试时需要添加 `-L` 参数以跟随重定向
- 浏览器访问会自动跟随重定向

## 功能说明

### 运控更新线路

运控更新线路用于存储实时更新的线路数据，与预设线路不同，这些数据可以随时更新而不影响预设线路。应用可以从云端获取最新的运控线路数据。

### 彩蛋配置

彩蛋配置允许你从云端管理：
- 触发彩蛋的站点列表
- 彩蛋显示的消息列表
- 彩蛋的启用/禁用状态

### 节日配置

节日配置允许你从云端管理：
- 生日的日期、消息和UI样式
- 农历新年的持续时间、消息和UI样式
- 所有节日的启用/禁用状态

### 更新日志和安装包

更新日志和安装包 API 通过 Cloudflare Worker 代理 GitHub Releases，提供以下优势：

1. **更快的访问速度**：利用 Cloudflare 全球 CDN 边缘节点，响应速度更快
2. **统一管理入口**：所有更新相关请求通过 Worker，便于监控和管理
3. **降级支持**：如果 GitHub API 不可用，可以在 Worker 中实现缓存或降级方案
4. **下载统计**：可以记录下载请求（需要额外实现）
5. **未来扩展**：可以扩展为从 Cloudflare R2 或其他存储提供下载

**工作流程：**
```
客户端请求 → Cloudflare Worker → GitHub API → 返回数据
                ↓
            （可选：缓存、统计、转换）
```

**在应用中使用：**

应用会自动优先从 Cloudflare Worker 获取更新日志，如果 Worker 不可用，会自动降级到直接访问 GitHub API。

```javascript
// 在 useCloudConfig.js 中已实现
const cloudConfig = useCloudConfig('https://metro.tanzhouxiang.dpdns.org');
const releases = await cloudConfig.getReleases();
const latest = await cloudConfig.getLatestRelease();
```

## 注意事项

1. **Token 安全**：如果设置了 `CLOUD_TOKEN`，请妥善保管，不要泄露
2. **KV 存储限制**：Cloudflare KV 有存储限制，单个值最大 25MB
3. **请求限制**：免费版 Worker 有每日请求限制，请合理使用
4. **CORS**：所有 API 都支持 CORS，可以从任何域名访问
