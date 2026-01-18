# Metro-PIDS 版本更新快速开始

## 🚀 快速发布新版本

### 方式一：使用命令行脚本（推荐）

1. **构建应用**
   ```bash
   npm run build:win
   ```

2. **运行发布脚本**
   ```bash
   node scripts/publish-update.js \
     --file dist/Metro-PIDS-Setup-1.5.5.exe \
     --version 1.5.5
   ```

3. **上传安装包到 CDN**
   - 将 `dist/Metro-PIDS-Setup-1.5.5.exe` 上传到你的 CDN
   - 确保可通过 `https://metro.tanzhouxiang.dpdns.org/update/Metro-PIDS-Setup-1.5.5.exe` 访问

完成！客户端会自动检测到新版本。

### 方式二：使用快捷脚本

1. **编辑发布脚本**
   - Windows: 编辑 `publish-example.bat`
   - macOS/Linux: 编辑 `publish-example.sh`
   - 修改 `VERSION` 和其他参数

2. **运行脚本**
   - Windows: 双击 `publish-example.bat`
   - macOS/Linux: `./publish-example.sh`

### 方式三：使用后台管理界面

1. 访问 `https://your-admin-page.pages.dev`
2. 进入"版本更新"标签
3. 选择安装包文件（自动计算 SHA512）
4. 填写版本号和其他信息
5. 点击"生成版本信息"
6. 点击"上传到服务器"

---

## 📋 设置强制更新

### 方式 1: 设置最低版本要求

```bash
node scripts/publish-update.js \
  --file dist/Metro-PIDS-Setup-1.5.5.exe \
  --version 1.5.5 \
  --minimum-version 1.5.0  # 低于 1.5.0 的必须更新
```

### 方式 2: 强制所有版本更新

```bash
node scripts/publish-update.js \
  --file dist/Metro-PIDS-Setup-1.5.5.exe \
  --version 1.5.5 \
  --force-update  # 所有版本都必须更新
```

---

## 📝 添加更新日志

```bash
node scripts/publish-update.js \
  --file dist/Metro-PIDS-Setup-1.5.5.exe \
  --version 1.5.5 \
  --changelog-title "版本 1.5.5" \
  --changelog-content "### 新功能\n- 添加了云控更新\n- 改进了UI"
```

---

## 🔧 完整参数示例

```bash
node scripts/publish-update.js \
  --file dist/Metro-PIDS-Setup-1.5.5.exe \
  --version 1.5.5 \
  --platform win32 \
  --arch x64 \
  --minimum-version 1.5.0 \
  --changelog-title "版本 1.5.5 - 重大更新" \
  --changelog-content "### 新功能\n- 添加了云控更新功能\n- 改进了更新日志显示\n- 支持强制更新机制\n\n### 改进\n- 优化了启动速度\n- 改进了错误提示\n\n### 修复\n- 修复了显示端偶尔黑屏的问题\n- 修复了线路切换时的崩溃问题"
```

---

## 🌍 多平台发布

### Windows x64
```bash
node scripts/publish-update.js \
  --file dist/Metro-PIDS-Setup-1.5.5.exe \
  --version 1.5.5 \
  --platform win32 \
  --arch x64
```

### macOS Apple Silicon
```bash
node scripts/publish-update.js \
  --file dist/Metro-PIDS-1.5.5-arm64.dmg \
  --version 1.5.5 \
  --platform darwin \
  --arch arm64
```

### Linux x64
```bash
node scripts/publish-update.js \
  --file dist/Metro-PIDS-1.5.5.AppImage \
  --version 1.5.5 \
  --platform linux \
  --arch x64
```

---

## ⚙️ 设置环境变量

为了安全上传，建议设置认证令牌：

**Windows (PowerShell):**
```powershell
$env:CLOUD_TOKEN="your-token-here"
```

**macOS/Linux:**
```bash
export CLOUD_TOKEN="your-token-here"
```

或在脚本中使用 `--token` 参数：
```bash
node scripts/publish-update.js \
  --file dist/Metro-PIDS-Setup-1.5.5.exe \
  --version 1.5.5 \
  --token "your-token-here"
```

---

## 📖 详细文档

更多详细信息，请参阅：
- [完整更新指南](scripts/README-UPDATE.md)
- [API 文档](API_DOCUMENTATION.md)

---

## ❓ 常见问题

**Q: 如何验证更新是否成功？**

A: 启动旧版本客户端，应该会收到更新提示。或访问：
```
https://metro.tanzhouxiang.dpdns.org/update/check?platform=win32&arch=x64&version=0.0.0
```

**Q: 如何回滚版本？**

A: 上传旧版本的版本信息即可。

**Q: 更新文件存储在哪里？**

A: 版本信息存储在 Cloudflare KV，安装包需要上传到 CDN 或 Cloudflare R2。

**Q: 如何测试更新功能？**

A: 在应用设置中将更新源改为 Cloudflare，然后点击"检查更新"。

---

## 🎉 就这么简单！

一条命令，版本信息自动上传到云端，客户端自动检测更新。
