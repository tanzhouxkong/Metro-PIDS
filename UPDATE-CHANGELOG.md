# Metro-PIDS 更新日志 - 版本优先级与操作系统识别

## 🎉 v1.5.6 更新内容

### ⚡ 更新源优先级调整

#### 变更说明
将 **Cloudflare** 设为默认和优先的更新源，GitHub 作为自动降级备选方案。

#### 优先级顺序
```
1. Cloudflare（默认，推荐）⭐
   ↓ 失败时自动降级
2. GitHub（自动备选）
   ↓ 用户手动选择
3. Gitee（国内镜像）
```

#### 自动降级机制
- Cloudflare 检查失败时，自动切换到 GitHub
- 无需用户手动操作
- 提高更新检查成功率

#### 用户体验改进
- 全球用户享受更快的更新检查速度（50-100ms）
- 网络故障时自动降级，无感知切换
- 仍支持手动选择更新源

### 📊 操作系统识别

#### 新增功能
- **操作系统统计**: 显示各操作系统的访问次数分布
- **访问记录**: 表格新增"操作系统"列，带图标显示
- **智能识别**: 自动识别 Windows、macOS、Linux 及版本号

#### 支持的系统
- 🪟 Windows (10/11, 8.1, 8, 7)
- 🍎 macOS (自动识别版本号，如 14.2, 13.x)
- 🐧 Linux (Ubuntu, Debian, Fedora)
- 🤖 Android
- 📱 iOS

#### 数据展示
- 统计信息新增"操作系统分布"字段
- 访问记录表格新增"操作系统"列
- CSV 导出包含操作系统信息
- 操作系统图标化显示

### 📝 后台管理界面优化

#### 统计信息展示
- 新增操作系统分布统计
- 访问记录自动合并短时间内的重复访问（5分钟）
- 高频访问设备黄色高亮显示
- 显示访问次数和持续时间

#### CSV 导出增强
- 包含操作系统统计
- 包含完整的操作系统信息列
- 数据结构更完整

### 🔧 技术改进

#### Worker API
- `POST /telemetry`: 接收并存储操作系统信息
- `GET /stats`: 返回操作系统分布统计
- 新增 `parseOS()` 函数智能解析操作系统

#### 客户端
- 上报 `platform` 信息（Electron 或浏览器）
- 自动获取平台信息（`process.platform` 或 `navigator.platform`）

#### 更新逻辑
- `getUpdateSource()` 默认返回 'cloudflare'
- `update/check` IPC 处理器添加自动降级逻辑
- 新增 `checkGitHubUpdateAsFallback()` 降级函数

---

## 📦 完整变更列表

### 修改的文件

1. **main.js**
   - `getUpdateSource()`: 默认改为 'cloudflare'
   - `update/check`: 添加自动降级逻辑
   - `checkGitHubUpdateAsFallback()`: 新增 GitHub 降级函数
   - `initAutoUpdater()`: 更新 Cloudflare 优先级说明

2. **cloudflare/src/index.js**
   - `parseOS()`: 新增操作系统解析函数
   - `POST /telemetry`: 接收并存储 os 字段
   - `GET /stats`: 返回 byOS 统计

3. **src/composables/useCloudConfig.js**
   - `sendTelemetry()`: 上报 platform 信息

4. **src/components/SlidePanel.js**
   - `updateSource` 默认值改为 'cloudflare'
   - `loadReleaseNotes()`: 默认值改为 'cloudflare'
   - `onMounted()`: 默认设置 Cloudflare

5. **src/components/LeftRail.js**
   - `loadReleaseNotes()`: 默认值改为 'cloudflare'

6. **cloudflare/admin.html**
   - 新增"操作系统分布"显示字段
   - 表格新增"操作系统"列
   - `mergeRepeatedVisits()`: 合并时包含 os 字段
   - `getOSIcon()`: 新增操作系统图标函数
   - CSV 导出包含操作系统信息

### 新增的文件

1. **UPDATE-PRIORITY.md**
   - 更新源优先级策略说明
   - 自动降级机制文档
   - 性能对比和使用建议

2. **cloudflare/OS-DETECTION.md**
   - 操作系统识别功能说明
   - 识别能力和技术实现
   - 数据格式和使用建议

---

## 🚀 使用指南

### 更新源配置

**默认配置（推荐）**
```
更新源: Cloudflare
```
- ✅ 自动降级到 GitHub
- ✅ 全球最快响应速度
- ✅ 无需额外配置

**手动切换**
如需手动选择更新源，可在设置中修改（如果UI可用）。

### 操作系统数据

**查看统计**
1. 访问后台管理界面
2. 进入"统计信息"标签
3. 查看"操作系统分布"字段

**下载数据**
点击"下载访问记录"按钮，CSV 文件包含完整的操作系统信息。

---

## 🔍 验证方法

### 1. 验证更新源优先级
```bash
# 查看日志
tail -f %APPDATA%\Metro-PIDS\logs\main.log

# 应该看到：
[main] 检查更新，更新源: cloudflare
[main] ✅ Cloudflare 更新检查成功
```

### 2. 验证降级机制
```bash
# 如果 Cloudflare 失败，应该看到：
[main] ❌ Cloudflare 更新检查出错，降级到 GitHub
[main] 🔄 降级使用 GitHub 检查更新
[main] 📦 GitHub 备用更新源发现新版本: x.x.x
```

### 3. 验证操作系统识别
1. 启动应用（会自动上报统计）
2. 访问后台管理界面
3. 刷新使用统计
4. 查看"操作系统分布"字段
5. 检查访问记录表格中的"操作系统"列

---

## 📌 注意事项

### 兼容性
- ✅ 完全向后兼容
- ✅ 旧数据自动适配（os 字段显示为 "Unknown"）
- ✅ 不影响现有功能

### 性能
- ✅ 降级检查不影响正常使用
- ✅ 操作系统解析性能开销极小
- ✅ 统计合并减少显示负担

### 数据
- ✅ 所有原始数据完整保留
- ✅ 下载功能导出完整数据
- ✅ 统计准确性不受影响

---

更新完成！✨
