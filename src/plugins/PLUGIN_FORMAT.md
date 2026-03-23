# Metro-PIDS 插件格式（WordPress 兼容）

本格式参考 [WordPress block.json](https://developer.wordpress.org/block-editor/reference-guides/block-api/block-metadata/)，便于与 WordPress 生态共享配置。

## plugin.json 规范

```json
{
  "name": "metro-pids/plugin-slug",
  "title": "插件显示名称",
  "description": "插件描述",
  "version": "1.0.0",
  "author": "作者名",
  "category": "metro-pids-trigger",
  "apiVersion": 2,
  "metroPids": {
    "hooks": ["lineSwitch", "stationArrive", "dateCheck"],
    "configSchema": {}
  }
}
```

### 与 WordPress 的对应关系

| 本格式字段 | WordPress block.json |
|------------|----------------------|
| name | name（需命名空间） |
| title | title |
| description | description |
| version | version |
| author | - |
| category | category |
| apiVersion | apiVersion |

### 云端配置 API

- 彩蛋：`GET/PUT /easter-eggs`
- 节日：`GET/PUT /holidays`，`GET /holidays/active`

WordPress 可通过相同 REST API 读写配置，实现配置共享。
