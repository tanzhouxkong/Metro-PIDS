# D1 使用统计迁移说明

使用统计已从 KV 迁移到 D1 数据库，支持全量查询、按日期排序，不再受 1000 条限制。

## 首次配置步骤

### 1. 创建 D1 数据库

```powershell
cd cloudflare
wrangler d1 create metro-pids-db
```

会输出类似：

```
✅ Successfully created DB 'metro-pids-db'
[[d1_databases]]
binding = "DB"
database_name = "metro-pids-db"
database_id = "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
```

### 2. 配置 wrangler.toml

将 `database_id` 复制到 `cloudflare/wrangler.toml`，替换 `REPLACE_WITH_YOUR_DATABASE_ID`：

```toml
[[d1_databases]]
binding = "DB"
database_name = "metro-pids-db"
database_id = "你的-database-id"
```

### 3. 应用迁移（创建表）

```powershell
cd cloudflare
wrangler d1 migrations apply metro-pids-db --remote
```

### 4. 部署 Worker

```powershell
scripts\deploy-cloudflare.bat
```

## 数据说明

- **KV 旧数据**：迁移后不再从 KV 读取 telemetry，历史 KV 数据保留但不显示。
- **新数据**：从部署完成起，所有新上报的统计会写入 D1。
- 如需迁移 KV 历史数据到 D1，需单独编写迁移脚本。

## 表结构

```sql
CREATE TABLE telemetry (
  id TEXT PRIMARY KEY,
  device_id TEXT NOT NULL,
  version TEXT NOT NULL,
  country TEXT NOT NULL,
  city TEXT NOT NULL,
  os TEXT NOT NULL,
  ts INTEGER NOT NULL
);
```
