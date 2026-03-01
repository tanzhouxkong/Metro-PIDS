# Verify Cloudflare Worker Deployment
# Check if APIs are working properly

# Set console output encoding to UTF-8
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "验证 Cloudflare Worker 部署" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

$apiBase = "https://metro.tanzhouxiang.dpdns.org"
$success = $true

# 1. 测试根路径（API 文档）
Write-Host "📋 测试 1: API 文档 (GET /)..." -ForegroundColor Yellow
try {
    $response = Invoke-RestMethod -Uri "$apiBase/" -Method Get -ErrorAction Stop
    Write-Host "✅ API 文档可访问" -ForegroundColor Green
    if ($response.api) {
        Write-Host "   支持的 API: $($response.api.Count) 个端点" -ForegroundColor White
    }
} catch {
    Write-Host "❌ API 文档无法访问: $_" -ForegroundColor Red
    $success = $false
}

Write-Host ""

# 2. 测试统计信息
Write-Host "📊 测试 2: 统计信息 (GET /stats)..." -ForegroundColor Yellow
try {
    $response = Invoke-RestMethod -Uri "$apiBase/stats" -Method Get -ErrorAction Stop
    Write-Host "✅ 统计信息 API 正常" -ForegroundColor Green
    if ($response.byCountry) {
        Write-Host "   国家分布: $($response.byCountry.Count) 个国家/地区" -ForegroundColor White
    }
    if ($response.byVersion) {
        Write-Host "   版本分布: $($response.byVersion.Count) 个版本" -ForegroundColor White
    }
    if ($response.byOS) {
        Write-Host "   操作系统分布: $($response.byOS.Count) 种系统" -ForegroundColor White
    }
} catch {
    Write-Host "❌ 统计信息 API 无法访问: $_" -ForegroundColor Red
    $success = $false
}

Write-Host ""

# 3. 测试更新检查
Write-Host "🔄 测试 3: 更新检查 (GET /update/check)..." -ForegroundColor Yellow
try {
    $response = Invoke-RestMethod -Uri "$apiBase/update/check?platform=win32&arch=x64&version=1.5.5" -Method Get -ErrorAction Stop
    Write-Host "✅ 更新检查 API 正常" -ForegroundColor Green
    if ($response.hasUpdate) {
        Write-Host "   有新版本: $($response.version)" -ForegroundColor White
    } else {
        Write-Host "   当前版本是最新的" -ForegroundColor White
    }
} catch {
    Write-Host "❌ 更新检查 API 无法访问: $_" -ForegroundColor Red
    $success = $false
}

Write-Host ""

# 4. 测试更新日志
Write-Host "📝 测试 4: 更新日志 (GET /update/changelog)..." -ForegroundColor Yellow
try {
    $response = Invoke-RestMethod -Uri "$apiBase/update/changelog" -Method Get -ErrorAction Stop
    Write-Host "✅ 更新日志 API 正常" -ForegroundColor Green
    if ($response -is [array]) {
        Write-Host "   更新日志条目: $($response.Count) 条" -ForegroundColor White
    } elseif ($response.changelog) {
        Write-Host "   更新日志条目: $($response.changelog.Count) 条" -ForegroundColor White
    }
} catch {
    Write-Host "⚠️  更新日志 API 可能未配置（这是正常的）: $_" -ForegroundColor Yellow
}

Write-Host ""

# 5. 测试运控线路
Write-Host "🚇 测试 5: 运控线路 (GET /runtime/lines)..." -ForegroundColor Yellow
try {
    $response = Invoke-RestMethod -Uri "$apiBase/runtime/lines" -Method Get -ErrorAction Stop
    Write-Host "✅ 运控线路 API 正常" -ForegroundColor Green
    if ($response.lines) {
        Write-Host "   运控线路数量: $($response.lines.Count) 条" -ForegroundColor White
    }
} catch {
    Write-Host "⚠️  运控线路 API 可能未配置（这是正常的）: $_" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
if ($success) {
    Write-Host "✅ 部署验证成功！" -ForegroundColor Green
} else {
    Write-Host "⚠️  部分 API 无法访问，请检查部署状态" -ForegroundColor Yellow
}
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "📋 API 地址:" -ForegroundColor Cyan
Write-Host "   $apiBase/" -ForegroundColor White
Write-Host ""
Write-Host "💡 提示:" -ForegroundColor Cyan
Write-Host "   - 查看实时日志: wrangler tail" -ForegroundColor White
Write-Host "   - 管理后台: https://metro-pids-admin.pages.dev" -ForegroundColor White
Write-Host ""
