# Cloudflare Worker 和 Pages 部署指南

## 🚀 快速部署

### 方式一：使用脚本（推荐）

**Windows:**
```powershell
.\scripts\deploy-cloudflare.ps1
```

或双击运行：
```
scripts\deploy-cloudflare.bat
```

### 方式二：使用 npm 脚本

```bash
# 只部署 Worker
npm run deploy:cloudflare

# 部署 Worker 和 Pages
npm run deploy:cloudflare
npm run deploy:cloudflare:pages
```

### 方式三：手动部署

#### 1. 部署 Cloudflare Worker

```bash
cd cloudflare
wrangler deploy
```

#### 2. 部署 Cloudflare Pages（可选）

```bash
cd cloudflare
wrangler pages deploy . --project-name=metro-pids-admin --commit-dirty=true
```

---

## 📋 部署前检查

### 1. 安装 wrangler

```bash
npm install -g wrangler
```

### 2. 登录 Cloudflare

```bash
wrangler login
```

这会打开浏览器，授权 wrangler 访问您的 Cloudflare 账号。

### 3. 验证登录

```bash
wrangler whoami
```

应该显示您的 Cloudflare 账号信息。

### 4. 检查配置

确认 `cloudflare/wrangler.toml` 中的配置正确：
- `account_id`: Cloudflare 账号 ID（可选，wrangler 会自动检测）
- `kv_namespaces`: KV 存储命名空间 ID
- `routes`: 自定义域名路由（如果使用）

---

## 🔧 部署 Worker

### 基本命令

```bash
cd cloudflare
wrangler deploy
```

### 部署到特定环境

```bash
# 部署到生产环境
wrangler deploy --env production

# 部署到预览环境
wrangler deploy --env preview
```

### 查看部署日志

```bash
wrangler tail
```

---

## 📄 部署 Pages

### 部署 admin.html

```bash
cd cloudflare
wrangler pages deploy . --project-name=metro-pids-admin
```

### 指定项目名称

```bash
wrangler pages deploy . --project-name=metro-pids-admin --commit-dirty=true
```

`--commit-dirty=true` 允许在有未提交更改时部署。

### 查看 Pages 部署状态

访问 Cloudflare Dashboard：
```
https://dash.cloudflare.com/
```

进入 **Pages** → 选择项目 → 查看部署历史。

---

## ✅ 验证部署

### 1. 验证 Worker

访问 API 文档：
```
https://metro.tanzhouxiang.dpdns.org/
```

应该看到 JSON 格式的 API 文档。

### 2. 验证 Pages

访问管理后台：
```
https://metro-pids-admin.pages.dev
```

或配置的自定义域名。

### 3. 测试 API

```bash
# 测试根路径
curl https://metro.tanzhouxiang.dpdns.org/

# 测试获取运控线路
curl https://metro.tanzhouxiang.dpdns.org/runtime/lines

# 测试获取统计信息
curl https://metro.tanzhouxiang.dpdns.org/stats
```

---

## 🔍 常见问题

### 问题 1: wrangler 未找到

**解决方案:**
```bash
npm install -g wrangler
```

### 问题 2: 未登录 Cloudflare

**错误信息:**
```
Error: You need to be logged in to use Wrangler.
```

**解决方案:**
```bash
wrangler login
```

### 问题 3: KV 命名空间不存在

**错误信息:**
```
Error: KV namespace not found
```

**解决方案:**
```bash
# 创建 KV 命名空间
wrangler kv:namespace create METRO_PIDS_CONFIG

# 将返回的 id 添加到 wrangler.toml
```

### 问题 4: 自定义域名路由失败

**错误信息:**
```
Error: Route pattern is invalid
```

**解决方案:**
- 确保域名已在 Cloudflare 账号下
- 检查 `wrangler.toml` 中的路由配置
- 确保域名已正确配置 DNS

### 问题 5: 部署后 API 返回 404

**解决方案:**
1. 检查 Worker 日志：`wrangler tail`
2. 确认路由配置正确
3. 检查 Worker 代码是否正确处理路径

---

## 📊 部署后的地址

部署成功后，您可以通过以下地址访问：

### Worker API
```
https://metro.tanzhouxiang.dpdns.org/
```

### 管理后台（Pages）
```
https://metro-pids-admin.pages.dev
```

### API 端点示例
```
# 获取运控线路
GET https://metro.tanzhouxiang.dpdns.org/runtime/lines

# 获取节日配置
GET https://metro.tanzhouxiang.dpdns.org/holidays

# 获取统计信息
GET https://metro.tanzhouxiang.dpdns.org/stats

# 检查更新
GET https://metro.tanzhouxiang.dpdns.org/update/check?platform=win32&arch=x64&version=1.5.5

# 获取更新日志
GET https://metro.tanzhouxiang.dpdns.org/update/changelog
```

---

## 🔄 更新部署

### 更新 Worker

```bash
cd cloudflare
wrangler deploy
```

### 更新 Pages

```bash
cd cloudflare
wrangler pages deploy . --project-name=metro-pids-admin --commit-dirty=true
```

### 一键更新（脚本）

```powershell
.\scripts\deploy-cloudflare.ps1
```

---

## 📝 部署清单

部署前确认：

- [ ] `wrangler` 已安装（`npm install -g wrangler`）
- [ ] 已登录 Cloudflare（`wrangler login`）
- [ ] `wrangler.toml` 配置正确
- [ ] KV 命名空间已创建（如果需要）
- [ ] 代码已保存（所有更改已保存）
- [ ] 准备部署

部署后验证：

- [ ] Worker API 可访问（`curl https://metro.tanzhouxiang.dpdns.org/`）
- [ ] 管理后台可访问（`https://metro-pids-admin.pages.dev`）
- [ ] 运控线路 API 正常（`/runtime/lines`）
- [ ] 节日配置 API 正常（`/holidays`）
- [ ] 统计信息 API 正常（`/stats`）
- [ ] 更新检查 API 正常（`/update/check`）

---

## 🎯 快速参考

### 部署命令

```bash
# Worker
cd cloudflare && wrangler deploy

# Pages
cd cloudflare && wrangler pages deploy . --project-name=metro-pids-admin --commit-dirty=true

# 两者都部署
npm run deploy:cloudflare && npm run deploy:cloudflare:pages
```

### 查看日志

```bash
# Worker 实时日志
wrangler tail

# Worker 日志（最近）
wrangler tail --format pretty

# Pages 部署历史
# 在 Cloudflare Dashboard 中查看
```

### 回滚部署

如果需要回滚到之前的版本：

1. **Worker**: 在 Cloudflare Dashboard 中查看版本历史并回滚
2. **Pages**: 在 Cloudflare Dashboard 的 Pages 项目中回滚部署

---

部署完成！🎉
