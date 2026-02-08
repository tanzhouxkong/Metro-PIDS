# D1 数据库初始化脚本（使用统计迁移到 D1）
# 首次运行：1) 执行 wrangler d1 create metro-pids-db
#          2) 将返回的 database_id 填到 wrangler.toml
#          3) 运行此脚本
# 运行前请确保已登录：wrangler login

$cloudflareDir = Join-Path $PSScriptRoot ".."
Push-Location $cloudflareDir

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Metro-PIDS D1 数据库初始化" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# 检查 wrangler.toml 是否已配置 database_id
$tomlContent = Get-Content -Path "wrangler.toml" -Raw
if ($tomlContent -match "REPLACE_WITH_YOUR_DATABASE_ID") {
    Write-Host "请先完成 D1 配置：" -ForegroundColor Red
    Write-Host "  1. 运行: wrangler d1 create metro-pids-db" -ForegroundColor Yellow
    Write-Host "  2. 将输出的 database_id 填入 wrangler.toml，替换 REPLACE_WITH_YOUR_DATABASE_ID" -ForegroundColor Yellow
    Write-Host "  3. 重新运行此脚本" -ForegroundColor Yellow
    Pop-Location
    exit 1
}

Write-Host "应用 D1 迁移..." -ForegroundColor Yellow
wrangler d1 migrations apply metro-pids-db --remote
if ($LASTEXITCODE -eq 0) {
    Write-Host "迁移应用成功。" -ForegroundColor Green
} else {
    Write-Host "迁移失败，请检查 wrangler.toml 中 database_id 是否正确。" -ForegroundColor Red
}

Pop-Location
Write-Host ""
Write-Host "完成后运行 scripts\deploy-cloudflare.bat 部署 Worker。" -ForegroundColor Cyan
