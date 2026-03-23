# 开发环境与打包环境显示不一致问题排查指南

## 可能的原因

### 1. 资源路径问题
**问题**：开发环境使用 Vite 开发服务器，打包后使用 `file://` 协议，资源路径可能不同。

**解决方案**：
- 已配置 `base: './'` 确保相对路径一致
- 已配置 `publicDir: 'assets'` 确保静态资源被正确复制
- 检查 `assets/` 目录是否被正确复制到 `out/renderer/assets/`

### 2. 构建缓存问题
**问题**：Vite 缓存可能导致构建结果不正确。

**解决方案**：
```bash
# 清理 Vite 缓存
npm run clean:vite

# 完全清理（包括 out 目录）
npm run clean:vite:all

# 重新构建
npm run build
```

### 3. 环境判断代码
**问题**：代码中可能有 `isPackaged` 判断，导致开发环境和打包环境行为不同。

**检查位置**：
- `src/components/LeftRail.js` - 开发者按钮显示逻辑
- 其他使用 `window.electronAPI.isPackaged()` 的地方

### 4. Console 输出被移除
**问题**：生产环境会移除 `console.log`，可能影响调试。

**解决方案**：
- 开发环境：所有 console 输出正常
- 打包环境：console 被移除（这是正常的优化行为）

### 5. 资源加载失败
**问题**：某些资源（如 Font Awesome）在打包后可能加载失败。

**检查方法**：
1. 打开打包后的应用
2. 打开开发者工具（F12）
3. 查看 Console 和 Network 标签页
4. 检查是否有资源加载错误

### 6. HTML 文件路径问题
**问题**：`getRendererUrl()` 函数在开发环境和打包环境返回不同的 URL。

**开发环境**：`http://localhost:5173/index.html`
**打包环境**：`file:///path/to/app.asar/out/renderer/index.html`

这是正常行为，但如果路径不正确会导致加载失败。

## 排查步骤

1. **清理缓存并重新构建**
   ```bash
   npm run clean:vite:all
   npm run build
   ```

2. **检查构建输出**
   - 查看 `out/renderer/` 目录
   - 确认所有 HTML 文件存在
   - 确认 `assets/` 目录被正确复制

3. **检查资源路径**
   - 打开打包后的应用
   - 打开开发者工具
   - 查看 Network 标签页，检查资源加载情况

4. **对比开发环境和打包环境**
   - 记录开发环境的具体显示内容
   - 记录打包环境的具体显示内容
   - 对比差异点

5. **检查控制台错误**
   - 开发环境：查看浏览器控制台
   - 打包环境：查看 Electron 主进程日志

## 常见问题

### Q: Font Awesome 图标不显示
**A**: 检查 `assets/fontawesome/` 是否被正确复制到 `out/renderer/assets/fontawesome/`

### Q: 样式不一致
**A**: 检查 CSS 文件是否被正确打包，查看 `out/renderer/assets/` 目录

### Q: JavaScript 功能缺失
**A**: 检查 JS 文件是否被正确打包，查看浏览器控制台是否有错误

### Q: 图片或其他资源加载失败
**A**: 确保所有资源都在 `assets/` 目录中，并且路径使用相对路径

## 调试技巧

1. **临时禁用代码压缩**（仅用于调试）
   - 在 `electron.vite.config.js` 中设置 `minify: false`
   - 重新构建并测试

2. **保留 console 输出**（仅用于调试）
   - 在 `electron.vite.config.js` 中设置 `drop: []`
   - 重新构建并测试

3. **检查构建日志**
   - 查看构建过程中的警告和错误
   - 确认所有资源都被正确处理
