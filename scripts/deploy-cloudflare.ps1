# Metro-PIDS Cloudflare Deployment Script
# Deploy Cloudflare Worker and Pages

# Set console output encoding to UTF-8
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Metro-PIDS Cloudflare 部署脚本" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# 检查 wrangler 是否已安装
Write-Host "📦 检查 wrangler 是否已安装..." -ForegroundColor Yellow
$wranglerInstalled = Get-Command wrangler -ErrorAction SilentlyContinue

if (-not $wranglerInstalled) {
    Write-Host "❌ wrangler 未安装，正在安装..." -ForegroundColor Red
    npm install -g wrangler
    if ($LASTEXITCODE -ne 0) {
        Write-Host "❌ 安装 wrangler 失败，请手动运行: npm install -g wrangler" -ForegroundColor Red
        exit 1
    }
} else {
    Write-Host "✅ wrangler 已安装" -ForegroundColor Green
}

Write-Host ""
Write-Host "🔐 检查是否已登录 Cloudflare..." -ForegroundColor Yellow
$wranglerWhoami = wrangler whoami 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "⚠️  未登录 Cloudflare，请先登录..." -ForegroundColor Yellow
    Write-Host "正在打开登录流程..." -ForegroundColor Yellow
    wrangler login
    if ($LASTEXITCODE -ne 0) {
        Write-Host "❌ 登录失败，请手动运行: wrangler login" -ForegroundColor Red
        exit 1
    }
} else {
    Write-Host $wranglerWhoami -ForegroundColor Green
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "开始部署..." -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# 进入 cloudflare 目录
$cloudflareDir = Join-Path $PSScriptRoot "..\cloudflare"
if (-not (Test-Path $cloudflareDir)) {
    Write-Host "❌ 找不到 cloudflare 目录: $cloudflareDir" -ForegroundColor Red
    exit 1
}

Push-Location $cloudflareDir

try {
    # 1. 部署 Worker
    Write-Host "📤 部署 Cloudflare Worker..." -ForegroundColor Yellow
    wrangler deploy
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host "✅ Worker 部署成功！" -ForegroundColor Green
    } else {
        Write-Host "❌ Worker 部署失败" -ForegroundColor Red
        exit 1
    }
    
    Write-Host ""
    
    # 2. 部署 Pages（如果有 admin.html）
    Write-Host "📤 部署 Cloudflare Pages..." -ForegroundColor Yellow
    $adminHtmlPath = Join-Path $cloudflareDir "admin.html"
    if (Test-Path $adminHtmlPath) {
        Write-Host "   检测到 admin.html，准备部署 Pages..." -ForegroundColor Yellow
        
        # 检查是否已配置 Pages 项目
        Write-Host "   ⚠️  注意: Pages 需要在 Cloudflare Dashboard 中配置项目" -ForegroundColor Yellow
        Write-Host "   或者使用命令: wrangler pages deploy --project-name=metro-pids-admin" -ForegroundColor Yellow
        Write-Host ""
        
        $deployPages = Read-Host "是否部署 Pages? (Y/N)"
        if ($deployPages -eq 'Y' -or $deployPages -eq 'y') {
            wrangler pages deploy . --project-name=metro-pids-admin --commit-dirty=true
            
            if ($LASTEXITCODE -eq 0) {
                Write-Host "✅ Pages 部署成功！" -ForegroundColor Green
            } else {
                Write-Host "⚠️  Pages 部署可能失败，请检查错误信息" -ForegroundColor Yellow
            }
        } else {
            Write-Host "⏭️  跳过 Pages 部署" -ForegroundColor Yellow
        }
    } else {
        Write-Host "⚠️  未找到 admin.html，跳过 Pages 部署" -ForegroundColor Yellow
    }
    
    Write-Host ""
    Write-Host "========================================" -ForegroundColor Cyan
    Write-Host "部署完成！" -ForegroundColor Green
    Write-Host "========================================" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "📋 部署结果:" -ForegroundColor Cyan
    Write-Host "   Worker:  https://metro.tanzhouxiang.dpdns.org" -ForegroundColor White
    Write-Host "   API 文档: https://metro.tanzhouxiang.dpdns.org/" -ForegroundColor White
    Write-Host "   管理后台: https://metro-pids-admin.pages.dev" -ForegroundColor White
    Write-Host ""
    Write-Host "💡 提示:" -ForegroundColor Cyan
    Write-Host "   - 如果部署了 Pages，管理后台地址可能会不同" -ForegroundColor White
    Write-Host "   - 可以在 Cloudflare Dashboard 中查看详细的部署日志" -ForegroundColor White
    Write-Host ""
    
} catch {
    Write-Host ""
    Write-Host "❌ 部署过程中出错: $_" -ForegroundColor Red
    exit 1
} finally {
    Pop-Location
}
