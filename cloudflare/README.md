# Metro-PIDS Cloudflare Worker 云控服务

## 功能概述

这个 Cloudflare Worker 提供了完整的云控服务，包括：

1. **预设线路管理** - 预设线路的增删查改
2. **运控更新线路** - 实时线路数据更新和管理
3. **彩蛋配置** - 云端配置彩蛋触发站点和消息
4. **节日配置** - 云端配置节日UI和功能

## 部署步骤

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

### 5. 配置 Token（可选）

在 `wrangler.toml` 中设置 `CLOUD_TOKEN` 以保护写操作：

```toml
[vars]
CLOUD_TOKEN = "你的安全token"
```

### 6. 部署

```bash
wrangler deploy
```

## 已部署地址（你的）

- **API Base**: `https://metro.tanzhouxiang.dpdns.org`
- **管理后台（旧版，已内置）**: `https://metro.tanzhouxiang.dpdns.org/admin`
- **管理后台（/admin-v2 统一跳转到 /admin）**: `https://metro.tanzhouxiang.dpdns.org/admin-v2`

## 方案 B：新版管理后台（Cloudflare Pages）

新版后台页面文件是：`cloudflare/admin.html`  
推荐部署到 Cloudflare Pages，并在 Worker 配置 `ADMIN_UI_URL`，让 `https://metro.tanzhouxiang.dpdns.org/admin-v2` 跳转到新版后台。

## API 接口

### 预设线路 API

- `GET /preset` - 获取所有预设线路
- `GET /preset/:lineName` - 获取单个预设线路
- `POST /preset` - 创建预设线路
- `PUT /preset/:lineName` - 更新预设线路
- `DELETE /preset/:lineName` - 删除预设线路

### 运控更新线路 API

- `GET /runtime/lines` - 获取所有运控线路
- `GET /runtime/lines/:lineName` - 获取单个运控线路
- `PUT /runtime/lines/:lineName` - 更新/创建运控线路
- `DELETE /runtime/lines/:lineName` - 删除运控线路

### 彩蛋配置 API

- `GET /easter-eggs` - 获取彩蛋配置
- `PUT /easter-eggs` - 更新彩蛋配置

**彩蛋配置格式：**
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
- `PUT /holidays` - 更新节日配置
- `GET /holidays/active` - 获取当前激活的节日

**节日配置格式：**
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

## 管理界面

访问 `https://你的worker域名.workers.dev/admin` 可以打开可视化管理界面。

## 使用示例

### 在应用中配置

```javascript
// 设置云控 API 地址
localStorage.setItem('cloudLinesApiBase', 'https://你的worker域名.workers.dev');
localStorage.setItem('cloudLinesProvider', 'api');
localStorage.setItem('cloudLinesAuthToken', '你的token'); // 如果需要
```
