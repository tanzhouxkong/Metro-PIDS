# 后台操作系统识别功能

## 📊 功能说明

后台管理界面现在支持识别和显示用户的操作系统信息，帮助您更好地了解用户群体的系统分布。

## ✨ 新增功能

### 1. 操作系统统计
在"使用统计"卡片中新增"操作系统分布"字段，显示各操作系统的访问次数：

```
操作系统分布: Windows 10/11: 15； macOS 14.2: 3； Linux: 1
```

### 2. 访问记录中显示操作系统
访问记录表格新增"操作系统"列，显示每条记录的操作系统信息：

| 国家/地区 | 城市 | 操作系统 | 版本 | 设备ID | 时间 |
|---|---|---|---|---|---|
| HK | Kwai Chung | 🪟 Windows 10/11 | 1.5.5 | 10f635d4... | 18:02:56 |
| CN | Shanghai | 🍎 macOS 14.2 | 1.5.5 | 261f5a1d... | 17:34:05 |

### 3. 操作系统图标
自动为不同操作系统添加对应的图标：

- 🪟 Windows
- 🍎 macOS
- 🐧 Linux
- 🤖 Android
- 📱 iOS
- 💻 其他/未知

## 🔍 识别能力

### 支持的操作系统

#### Windows
- Windows 10/11
- Windows 8.1
- Windows 8
- Windows 7
- Windows (通用)

#### macOS
- macOS 14.2 (Sonoma)
- macOS 13.x (Ventura)
- macOS 12.x (Monterey)
- macOS (通用，版本号可能识别)

#### Linux
- Linux (Ubuntu)
- Linux (Debian)
- Linux (Fedora)
- Linux (通用)

#### 移动平台
- Android
- iOS

### 识别方式

1. **优先使用客户端提供的平台信息**
   - Electron 客户端会上报 `process.platform` 信息
   - 浏览器会上报 `navigator.platform` 信息

2. **从 User-Agent 解析**
   - 当客户端未提供平台信息时
   - 从 HTTP 请求的 User-Agent 头部解析

3. **智能版本识别**
   - 尝试识别 Windows NT 版本号
   - 尝试识别 macOS 版本号（如 10.14, 11.0）

## 📈 数据展示

### 统计信息区域
```
使用统计
├─ 访问次数: 19
├─ 独立设备: 3
├─ 全球分布: HK: 19
├─ 使用版本: 1.5.5: 11； admin: 8
├─ 操作系统分布: Windows 10/11: 15； macOS 14.2: 3； Linux: 1  ← 新增
└─ 设备统计: ...
```

### 访问记录表格
```
2026年1月18日星期六 (3 组设备，共 19 次访问)
┌────────────┬────────────┬──────────────┬─────────┬──────────────┬──────────────────┐
│ 国家/地区   │ 城市       │ 操作系统      │ 版本    │ 设备ID        │ 时间              │
├────────────┼────────────┼──────────────┼─────────┼──────────────┼──────────────────┤
│ HK         │ Kwai Chung │ 🪟 Windows   │ 1.5.5   │ 10f635d4...  │ 18:02:56 (11次)  │
│ HK         │ Kwai Chung │ 🍎 macOS     │ admin   │ 261f5a1d...  │ 17:34:05 (4次)   │
│ HK         │ Kwai Chung │ 💻 Unknown   │ admin   │ unknown      │ 17:22:35 (4次)   │
└────────────┴────────────┴──────────────┴─────────┴──────────────┴──────────────────┘
```

### CSV 下载
下载的 CSV 文件包含操作系统信息：

```csv
# 按操作系统统计
操作系统,访问次数
Windows 10/11,15
macOS 14.2,3
Linux,1

# 详细访问记录
国家/地区,城市,操作系统,IP,版本,设备ID,时间
HK,Kwai Chung,Windows 10/11,xxx.xxx.xxx.xxx,1.5.5,10f635d4-4fcc-4b9b-befa-2f1ca792146d,2026/1/18 18:02:56
```

## 🔧 技术实现

### 1. Cloudflare Worker

#### OS 解析函数
```javascript
function parseOS(userAgent, platformHint) {
  // 优先使用客户端提供的平台信息
  if (platformHint) {
    const platform = String(platformHint).toLowerCase();
    if (platform.includes('win32') || platform.includes('windows')) {
      if (userAgent.includes('Windows NT 10.0')) return 'Windows 10/11';
      if (userAgent.includes('Windows NT 6.3')) return 'Windows 8.1';
      // ... 更多版本识别
      return 'Windows';
    }
    if (platform.includes('darwin') || platform.includes('mac')) {
      const macMatch = userAgent.match(/Mac OS X (\d+)[._](\d+)/);
      if (macMatch) return `macOS ${macMatch[1]}.${macMatch[2]}`;
      return 'macOS';
    }
    // ... Linux、Android、iOS 等
  }
  
  // 从 User-Agent 解析
  // ...
}
```

#### Telemetry 端点
```javascript
// POST /telemetry
const os = parseOS(userAgent, body.platform);
const entry = { country, city, ip, version, deviceId, os, ts };
```

#### 统计 API
```javascript
// GET /stats
const byOS = {};
for (const r of list) {
  const os = r.os || 'unknown';
  byOS[os] = (byOS[os] || 0) + 1;
}
return json({ ..., byOS, ... });
```

### 2. 客户端上报

#### useCloudConfig.js
```javascript
async function sendTelemetry(version) {
  const deviceId = getDeviceId();
  
  // 获取平台信息
  let platform = 'unknown';
  if (window.electronAPI?.platform) {
    platform = window.electronAPI.platform;
  } else if (navigator?.platform) {
    platform = navigator.platform;
  }
  
  await request('POST', '/telemetry', {
    version,
    deviceId,
    platform  // ← 新增
  });
}
```

### 3. 后台界面

#### 新增 DOM 元素
```html
<div class="field">
  <label>操作系统分布</label>
  <div id="stat-by-os" class="stat-meta">-</div>
</div>

<table>
  <thead>
    <tr>
      <th>国家/地区</th>
      <th>城市</th>
      <th>操作系统</th>  ← 新增
      <th>版本</th>
      <th>设备ID</th>
      <th>时间</th>
    </tr>
  </thead>
</table>
```

#### JavaScript 处理
```javascript
// 显示操作系统统计
const byOS = data.byOS || {};
document.getElementById('stat-by-os').textContent = 
  Object.entries(byOS)
    .sort((a, b) => b[1] - a[1])
    .map(([k, v]) => k + ': ' + v)
    .join('； ');

// 表格中添加操作系统列和图标
const osIcon = getOSIcon(item.os);
html += `<td>${osIcon} ${item.os || 'Unknown'}</td>`;
```

## 📊 实际案例

### 示例数据
```
访问统计：
- 总访问: 19 次
- 独立设备: 3 台
- 操作系统分布:
  • Windows 10/11: 11 次 (57.9%)
  • admin (管理后台): 8 次 (42.1%)

详细分析：
- 设备 10f635d4-4fcc... (Windows 10/11)
  • 11 次访问，分布在 3 个时间段
  • 最长持续 15 分钟
  
- 设备 261f5a1d-b22... (管理后台)
  • 4 次访问
  • 均在同一时间段

- 未知设备
  • 4 次访问
  • 来自管理后台
```

## 🔄 数据迁移

### 旧数据兼容
- 旧数据中没有 `os` 字段的记录会显示为 "Unknown"
- 不影响现有统计和下载功能
- 新上报的数据会包含 `os` 字段

### 存储格式
```json
{
  "country": "HK",
  "city": "Kwai Chung",
  "ip": "xxx.xxx.xxx.xxx",
  "version": "1.5.5",
  "deviceId": "10f635d4-4fcc-4b9b-befa-2f1ca792146d",
  "os": "Windows 10/11",  // ← 新增字段
  "ts": 1705578176000
}
```

## 💡 使用建议

### 1. 平台兼容性分析
通过操作系统分布了解用户主要使用的平台，优化对应平台的用户体验。

### 2. 版本测试优先级
根据用户系统分布，优先在用户量大的平台上进行测试。

### 3. Bug 追踪
当收到 bug 报告时，可以通过操作系统信息快速定位是否为特定平台问题。

### 4. 功能开发
了解用户操作系统分布，决定是否需要为特定平台开发专属功能。

## 📝 注意事项

1. **隐私保护**: 操作系统信息属于公开信息，不涉及用户隐私
2. **识别准确性**: 识别准确性依赖于 User-Agent 和客户端上报，可能存在误差
3. **旧数据显示**: 历史数据中未记录的操作系统会显示为 "Unknown"
4. **浏览器访问**: 从浏览器访问管理后台时会显示浏览器所在的操作系统

## 🎯 后续优化

可能的后续改进：

1. **架构信息**: 识别 x64、ARM64 等架构信息
2. **更详细的版本**: 识别更精确的系统版本号
3. **系统语言**: 识别用户系统语言
4. **屏幕分辨率**: 了解用户显示器配置（需客户端支持）
5. **性能指标**: 收集系统性能相关信息

---

操作系统识别功能已完全集成到后台管理系统中！🎉
