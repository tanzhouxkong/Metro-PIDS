-- 使用统计表（从 KV 迁移到 D1）
CREATE TABLE IF NOT EXISTS telemetry (
  id TEXT PRIMARY KEY,
  device_id TEXT NOT NULL,
  version TEXT NOT NULL,
  country TEXT NOT NULL,
  city TEXT NOT NULL,
  os TEXT NOT NULL,
  ts INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_telemetry_ts ON telemetry(ts DESC);
CREATE INDEX IF NOT EXISTS idx_telemetry_device ON telemetry(device_id);
