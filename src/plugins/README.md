# Metro-PIDS 插件系统

类 WordPress 的插件架构，彩蛋与新年灯笼等统一为可插拔模块。采用 WordPress block.json 兼容的 manifest 格式。

## 内置插件

### 1. 彩蛋 (metro-pids-easter-egg)

切换线路时，若当前线路包含指定站点则弹出随机消息通知。

**配置格式**（`/easter-eggs` API）：

```json
{
  "stations": ["经十路", "经十东路", "经十西路", "千佛山", "华洋名苑"],
  "messages": ["人生路漫漫 白鹭常相伴。", "今人不见古时月 今月曾经照古人。"],
  "enabled": true
}
```

| 字段 | 类型 | 说明 |
|------|------|------|
| stations | string[] | 触发站点名称，当前线路包含任一站点时触发 |
| messages | string[] | 随机展示的消息列表 |
| enabled | boolean | 是否启用 |

---

### 2. 新年灯笼 (metro-pids-new-year-lantern)

春节期间切换线路时弹出新年祝福消息。

**配置格式**（`/new-year-lantern` API）：

```json
{
  "messages": ["新春快乐，万事如意！", "福"],
  "enabled": true,
  "startDate": "2025-01-20",
  "endDate": "2025-02-15"
}
```

| 字段 | 类型 | 说明 |
|------|------|------|
| messages | string[] | 新年祝福消息，随机展示 |
| enabled | boolean | 是否启用 |
| startDate | string | 开始日期 YYYY-MM-DD（可选） |
| endDate | string | 结束日期 YYYY-MM-DD（可选） |

---

### 3. 节日 (metro-pids-holiday)

按日期匹配节日并弹出消息，使用 `/holidays` API。

---

## 插件格式（WordPress 兼容）

每个插件需提供 `plugin.json`（兼容 [WordPress block.json](https://developer.wordpress.org/block-editor/reference-guides/block-api/block-metadata/)）：

```json
{
  "name": "metro-pids/plugin-slug",
  "title": "插件显示名称",
  "description": "插件描述",
  "version": "1.0.0",
  "author": "作者",
  "category": "metro-pids-trigger",
  "metroPids": {
    "hooks": ["lineSwitch", "stationArrive", "dateCheck"],
    "configSchema": {}
  }
}
```

### 钩子说明

- **lineSwitch**：切换线路时，上下文 `{ lineName, stations }`
- **stationArrive**：到站时，上下文 `{ station, idx, lineName }`
- **dateCheck**：日期检查，上下文 `{ date }`

## 目录结构

```
plugins/
├── README.md
├── registry.js
├── metro-pids-easter-egg/      # 彩蛋
│   ├── plugin.json
│   └── index.js
├── metro-pids-new-year-lantern/ # 新年灯笼
│   ├── plugin.json
│   └── index.js
└── metro-pids-holiday/          # 节日
    ├── plugin.json
    └── index.js
```

## 云端 API

| 插件 | GET | PUT |
|------|-----|-----|
| 彩蛋 | `/easter-eggs` | `/easter-eggs` |
| 新年灯笼 | `/new-year-lantern` | `/new-year-lantern` |
| 节日 | `/holidays` | `/holidays` |
