# 部署指南

## ⚠️ 当前问题

如果遇到以下错误：
```
HttpError: 403 Forbidden
"Resource not accessible by personal access token"
```

**原因**: GitHub Personal Access Token (PAT) 缺少创建 Releases 所需的权限。

## 🔧 解决方案

### 步骤 1: 创建新的 GitHub Token（具有正确权限）

1. **访问 GitHub Token 设置页面**:
   ```
   https://github.com/settings/tokens
   ```

2. **点击 "Generate new token"** → **"Generate new token (classic)"**

3. **设置 Token 信息**:
   - **Note（备注）**: `Metro-PIDS Releases`（或任意描述性名称）
   - **Expiration（过期时间）**: 选择合适的时间（建议 90 天或更长）
   - **Select scopes（选择权限）**: ⚠️ **重要**，必须勾选：
     - ✅ **`repo`** (完整仓库访问权限)
       - 这会自动包含所有子权限：
         - `repo:status`
         - `repo_deployment`
         - `public_repo`
         - `repo:invite`
         - `security_events`
         - **`repo:releases`** ← 这是创建 Releases 必需的

4. **点击 "Generate token"**

5. **立即复制 Token**（只显示一次）:
   ```
   github_pat_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
   ```

### 步骤 2: 设置环境变量

#### 方法 A: PowerShell（当前会话有效）

在 PowerShell 中运行：

```powershell
$env:GH_TOKEN="你的新Token"
```

**验证**:
```powershell
echo $env:GH_TOKEN
```

#### 方法 B: 系统环境变量（永久有效，推荐）

1. 按 `Win + R`，输入 `sysdm.cpl`，回车
2. 点击 **"高级"** 标签
3. 点击 **"环境变量"**
4. 在 **"用户变量"** 区域：
   - 点击 **"新建"**
   - **变量名**: `GH_TOKEN`
   - **变量值**: 粘贴你的新 Token
   - 点击 **"确定"**
5. **重启 PowerShell 或命令提示符**（重要！）

**验证**:
```powershell
echo $env:GH_TOKEN
```

#### 方法 C: 使用脚本（推荐）

运行项目中的脚本：

```powershell
.\scripts\set-github-token.ps1 -Token "你的新Token"
```

然后**重启 PowerShell**。

### 步骤 3: 验证 Token 权限

在 PowerShell 中测试 Token 是否有效：

```powershell
# 测试 Token 是否能访问仓库
$headers = @{
    "Authorization" = "token $env:GH_TOKEN"
    "Accept" = "application/vnd.github.v3+json"
}
$response = Invoke-RestMethod -Uri "https://api.github.com/repos/tanzhouxkong/Metro-PIDS-" -Headers $headers
Write-Host "仓库名称: $($response.name)"
Write-Host "仓库状态: $($response.private ? '私有' : '公开')"
```

如果成功显示仓库信息，说明 Token 有效。

### 步骤 4: 部署新版本

#### 4.1 更新版本号

在 `package.json` 中更新版本号：

```json
{
  "version": "1.3.3"  // 新版本号
}
```

#### 4.2 打包并发布

```powershell
npm run publish:gh
```

这个命令会：
1. ✅ 打包应用（Windows 安装包）
2. ✅ 自动创建 GitHub Release（如果不存在）
3. ✅ 上传安装包到 Release
4. ✅ 生成 `latest.yml` 等元数据文件

#### 4.3 验证发布结果

访问 GitHub Releases 页面：
```
https://github.com/tanzhouxkong/Metro-PIDS-/releases
```

应该能看到：
- ✅ 新版本的 Release（例如 `v1.3.3`）
- ✅ Windows 安装包文件（`metro-pids-Setup-1.3.3.exe`）
- ✅ 元数据文件（`latest.yml`）

## 📋 完整部署流程

```powershell
# 1. 确保 Token 已设置
echo $env:GH_TOKEN

# 2. 更新版本号（在 package.json 中手动编辑）
# "version": "1.3.3"

# 3. 打包并发布
npm run publish:gh

# 4. 验证 Release 是否创建成功
# 访问: https://github.com/tanzhouxkong/Metro-PIDS-/releases
```

## 🐛 常见问题

### 问题 1: 仍然出现 403 错误

**可能原因**:
- Token 没有 `repo` 权限
- Token 已过期或被撤销
- 环境变量未正确设置

**解决方案**:
1. 检查 Token 权限：访问 https://github.com/settings/tokens，确认 Token 有 `repo` 权限
2. 重新生成 Token 并更新环境变量
3. **重启 PowerShell** 确保环境变量生效

### 问题 2: Token 设置后仍然无效

**解决方案**:
1. 确认使用的是**系统环境变量**（方法 B），而不是仅当前会话
2. **完全关闭并重新打开 PowerShell**
3. 验证环境变量：
   ```powershell
   echo $env:GH_TOKEN
   ```

### 问题 3: 发布成功但 Release 中没有文件

**可能原因**:
- 上传过程中断
- 网络问题

**解决方案**:
1. 检查 Release 页面，确认文件是否正在上传
2. 如果上传失败，重新运行 `npm run publish:gh`

### 问题 4: 需要发布到多个平台

**当前限制**: `electron-builder` 只能在对应系统上打包对应平台。

**解决方案**:
- **Windows**: 在 Windows 上运行 `npm run publish:gh`
- **Mac**: 在 macOS 上运行 `npm run publish:gh`
- **Linux**: 在 Linux 上运行 `npm run publish:gh`

或者使用 **GitHub Actions** 进行 CI/CD 自动构建。

## ✅ 部署检查清单

发布前确认：

- [ ] GitHub Token 已创建（具有 `repo` 权限）
- [ ] 环境变量 `GH_TOKEN` 已设置
- [ ] 已重启 PowerShell 或命令提示符
- [ ] Token 验证成功（能访问仓库 API）
- [ ] `package.json` 中的版本号已更新
- [ ] 运行 `npm run publish:gh` 成功
- [ ] GitHub Release 页面显示新版本
- [ ] 安装包文件已上传到 Release
- [ ] `latest.yml` 文件已生成

## 📚 相关文档

- [SETUP_GITHUB_TOKEN.md](./SETUP_GITHUB_TOKEN.md) - Token 设置详细指南
- [GITHUB_RELEASES_SETUP.md](./GITHUB_RELEASES_SETUP.md) - GitHub Releases 配置说明

## 🔒 安全提示

⚠️ **重要**: 
- 不要将 Token 提交到代码仓库
- 不要分享 Token 给他人
- 如果 Token 泄露，立即在 GitHub 设置中删除并创建新 Token
- 定期轮换 Token（建议每 90 天）

