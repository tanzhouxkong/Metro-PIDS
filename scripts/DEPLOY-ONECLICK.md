# Cloudflare 一键部署脚本

## 🚀 快速使用

### 方式一：双击运行（最简单）

在项目根目录双击运行：
```
deploy-cloudflare.bat
```

### 方式二：命令行运行

**Windows:**
```powershell
# 在项目根目录
.\deploy-cloudflare.bat

# 或直接运行 PowerShell 脚本
.\scripts\deploy-cloudflare-oneclick.ps1
```

**Linux/macOS:**
```bash
cd scripts
chmod +x deploy-cloudflare-oneclick.ps1
pwsh deploy-cloudflare-oneclick.ps1
```

## ✨ 功能特点

- ✅ **自动检查** wrangler 是否已安装，未安装则自动安装
- ✅ **自动检查** Cloudflare 登录状态，未登录则自动登录
- ✅ **自动部署** Cloudflare Worker
- ✅ **自动部署** Cloudflare Pages（如果存在 admin.html）
- ✅ **彩色输出** 清晰显示部署状态
- ✅ **无需交互** 一键完成所有操作

## 📋 部署前准备

### 首次使用需要：

1. **安装 Node.js**（如果还没有）
   - 下载：https://nodejs.org/
   - 验证：`node --version`

2. **登录 Cloudflare**（首次运行会自动提示）
   ```bash
   wrangler login
   ```

3. **配置 wrangler.toml**
   - 确保 `cloudflare/wrangler.toml` 中的配置正确
   - KV 命名空间 ID 已配置

## 🔄 部署流程

脚本会自动执行以下步骤：

1. ✅ 检查 wrangler 是否已安装
2. ✅ 检查 Cloudflare 登录状态
3. ✅ 部署 Cloudflare Worker
4. ✅ 部署 Cloudflare Pages（如果存在 admin.html）

## 📊 部署后的地址

部署成功后，可以通过以下地址访问：

- **Worker API**: `https://metro.tanzhouxiang.dpdns.org`
- **管理后台**: `https://metro-pids-admin.pages.dev`

## ⚠️ 注意事项

1. **首次部署**：需要先登录 Cloudflare（`wrangler login`）
2. **网络连接**：确保可以访问 Cloudflare 服务
3. **权限问题**：如果遇到 PowerShell 执行策略问题，运行：
   ```powershell
   Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
   ```

## 🐛 常见问题

### 问题 1: PowerShell 执行策略错误

**错误信息:**
```
无法加载文件，因为在此系统上禁止运行脚本
```

**解决方案:**
```powershell
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
```

### 问题 2: wrangler 未找到

**解决方案:**
脚本会自动尝试安装，如果失败，请手动运行：
```bash
npm install -g wrangler
```

### 问题 3: 登录失败

**解决方案:**
手动登录：
```bash
wrangler login
```

### 问题 4: 部署失败

**检查清单:**
- [ ] 已登录 Cloudflare（`wrangler whoami`）
- [ ] `wrangler.toml` 配置正确
- [ ] KV 命名空间已创建
- [ ] 网络连接正常

## 📝 与原有脚本的区别

| 特性 | 原脚本 | 一键脚本 |
|------|--------|----------|
| 交互式确认 | ✅ 是 | ❌ 否 |
| 自动安装 wrangler | ✅ 是 | ✅ 是 |
| 自动登录检查 | ✅ 是 | ✅ 是 |
| 自动部署 Worker | ✅ 是 | ✅ 是 |
| 自动部署 Pages | ⚠️ 需要确认 | ✅ 自动 |
| 适合 CI/CD | ❌ 否 | ✅ 是 |

## 🎯 使用场景

- ✅ **日常开发**：快速部署测试
- ✅ **CI/CD 流程**：自动化部署
- ✅ **快速更新**：修改后一键推送
- ✅ **批量部署**：无需人工干预

---

**提示**: 如果需要交互式部署（可以选择是否部署 Pages），请使用 `scripts/deploy-cloudflare.ps1`
