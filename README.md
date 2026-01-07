# Metro-PIDS

这是一个基于网页/Electron 的地铁站台信息显示（PIDS）控制与显示端项目。它包含一个控制面板（管理员界面）用于编辑线路、设置快捷键、启动自动播放等；以及一个用于投屏的显示端页面，用于实时展示下一站/车门信息与到站提示。

## ✨ 特性

### 📦 开箱即用
- 基于 **electron-vite** 构建，配置简单，开箱即用
- 支持 Vue 3 + Composition API
- 完整的 TypeScript 支持（可选）

### 🔥 热重启 - 主进程
- 修改 `main.js` 或 `preload.js` 时自动重启应用
- 无需手动重启，提升开发效率

### ⚡️ HMR - 渲染进程
- 修改 Vue 组件时自动热更新
- 保持应用状态，无需刷新页面
- 支持 CSS、JS 文件的即时更新

### 🔄 热重载 - 预加载脚本
- 修改 `preload.js` 时自动重载
- 无需重启应用即可看到更改

### 💪 完整的 Node.js API 支持
- 主进程、渲染进程、预加载脚本中均支持完整的 Node.js API
- 使用 `contextIsolation` 确保安全性
- 通过 `contextBridge` 安全地暴露 API

### 🎯 基于 Vite 官方模板
- 使用 Vue 3 + Vite 作为前端框架
- 支持现代 ES modules
- 快速的开发服务器和构建

## 主要功能

- 多线路支持：可以创建/删除/切换多条线路，每条线路包含站点列表与运行方向信息。
- 实时显示：Display 窗口用于投屏展示当前站、下一站、对侧开门提示等信息。
- 快捷键控制：支持配置"下一步/上一站/到达/发车"等快捷键，并在显示端按键时转发控制端执行。
- 自动播放（Autoplay）：支持按键或定时自动前进，带倒计时与暂停/继续功能。
- 主题与视觉：支持浅色/深色主题与一些视觉定制。
- 文件管理：可从文件夹加载线路 JSON、刷新并保存当前线路到打开的文件夹（需要主机 API 支持）。

## 文件结构

```
├── main.js              # 主进程入口（支持热重启 🔥）
├── preload.js           # 预加载脚本（支持热重载 🔄）
├── index.html           # 控制端主页
├── display_window.html  # 显示端页面
├── electron.vite.config.js  # electron-vite 配置
├── src/
│   ├── main.js          # Vue 应用入口（支持 HMR ⚡️）
│   ├── App.js           # 根组件
│   ├── components/      # Vue 组件
│   └── composables/     # Composition API 组合式函数
└── dist/                # 构建输出目录
    ├── main/            # 主进程和预加载脚本
    └── renderer/        # 渲染进程（前端）
```

## 安装与运行

### 开发环境

1. **安装依赖**：
```bash
npm install
```

2. **启动开发服务器**（支持热重启、HMR、热重载）：
```bash
npm run dev
```

开发模式特性：
- 🔥 **主进程热重启**：修改 `main.js` 自动重启
- ⚡️ **渲染进程 HMR**：修改 Vue 组件即时更新
- 🔄 **预加载脚本热重载**：修改 `preload.js` 自动重载
- 📦 **开箱即用**：无需额外配置

3. **预览构建结果**：
```bash
npm run preview
```

### 生产构建

```bash
npm run build
```

构建完成后，可执行文件位于 `dist/` 目录。

### 发布到 GitHub Releases

项目配置为自动发布到 GitHub Releases。发布前请确保：

1. **GitHub Token 已设置**（通过环境变量）：
   - `GH_TOKEN` 或 `GITHUB_TOKEN` 环境变量已配置
   - Token 需要 `repo` 权限

2. **发布命令**：
```powershell
# 使用 npm 脚本
npm run publish:gh

# 或直接使用 electron-builder
npx electron-builder --publish=always --win
```

**注意**：如果遇到 SSL 证书验证错误（`unable to verify the first certificate`），可能是企业网络环境的 SSL 拦截导致的。可以：

1. **手动上传**（推荐）：构建完成后，手动将 `dist/Metro-PIDS-Setup-{version}.exe` 上传到 GitHub Releases

2. **临时禁用 SSL 验证**（仅用于测试，不安全）：
```powershell
$env:NODE_TLS_REJECT_UNAUTHORIZED = "0"
npx electron-builder --publish=always --win
```

## 开发指南

### 主进程开发（main.js）

- 修改 `main.js` 后，electron-vite 会自动重启应用
- 支持完整的 Node.js API
- 使用 `require()` 导入模块

### 渲染进程开发（Vue 组件）

- 修改 Vue 组件后，Vite 会自动热更新
- 支持 Vue 3 Composition API
- 使用 ES modules (`import/export`)
- 支持 `<script setup>` 语法

### 预加载脚本开发（preload.js）

- 修改 `preload.js` 后，electron-vite 会自动重载
- 使用 `contextBridge` 暴露 API 到渲染进程
- 支持完整的 Node.js API

## 技术栈

- **Electron** - 跨平台桌面应用框架
- **electron-vite** - 基于 Vite 的 Electron 构建工具
- **Vue 3** - 渐进式 JavaScript 框架
- **Vite** - 下一代前端构建工具

## 许可证

MIT
