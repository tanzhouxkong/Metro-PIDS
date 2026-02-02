# Metro-PIDS Cloudflare Deployment Script
# Deploy Cloudflare Worker and Pages

# Set console output encoding to UTF-8
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Metro-PIDS Cloudflare Deployment Script" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Check wrangler
Write-Host "Checking if wrangler is installed..." -ForegroundColor Yellow
$wranglerInstalled = Get-Command wrangler -ErrorAction SilentlyContinue

if (-not $wranglerInstalled) {
    Write-Host "wrangler not found, installing with npm..." -ForegroundColor Yellow
    npm install -g wrangler
    if ($LASTEXITCODE -ne 0) {
        Write-Host "Failed to install wrangler. Please run: npm install -g wrangler" -ForegroundColor Red
        exit 1
    }
} else {
    Write-Host "wrangler is installed." -ForegroundColor Green
}

Write-Host ""
Write-Host "Checking Cloudflare login status..." -ForegroundColor Yellow
$wranglerWhoami = wrangler whoami 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "Not logged in to Cloudflare. Opening login flow..." -ForegroundColor Yellow
    wrangler login
    if ($LASTEXITCODE -ne 0) {
        Write-Host "Login failed. Please run: wrangler login" -ForegroundColor Red
        exit 1
    }
} else {
    Write-Host $wranglerWhoami -ForegroundColor Green
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Starting Cloudflare deployment..." -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Change to cloudflare directory
$cloudflareDir = Join-Path $PSScriptRoot "..\cloudflare"
if (-not (Test-Path $cloudflareDir)) {
    Write-Host "Cloudflare directory not found: $cloudflareDir" -ForegroundColor Red
    exit 1
}

Push-Location $cloudflareDir

try {
    # 1. Deploy Worker
    Write-Host "Deploying Cloudflare Worker..." -ForegroundColor Yellow
    wrangler deploy
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host "Worker deployed successfully." -ForegroundColor Green
    } else {
        Write-Host "Worker deployment failed." -ForegroundColor Red
        exit 1
    }
    
    Write-Host ""
    
    # 2. Deploy Pages (if admin.html exists)
    Write-Host "Deploying Cloudflare Pages..." -ForegroundColor Yellow
    $adminHtmlPath = Join-Path $cloudflareDir "admin.html"
    if (Test-Path $adminHtmlPath) {
        Write-Host "   Found admin.html, ready to deploy Pages..." -ForegroundColor Yellow
        
        # Inform about Pages project
        Write-Host "   Note: a Pages project named metro-pids-admin must exist in Cloudflare Dashboard." -ForegroundColor Yellow
        Write-Host "   You can also run manually: wrangler pages deploy --project-name=metro-pids-admin" -ForegroundColor Yellow
        Write-Host ""
        
        # Always deploy to Pages production (branch master) when admin.html exists
        Write-Host "Deploying Pages to production (branch: master)..." -ForegroundColor Yellow
        wrangler pages deploy . --project-name=metro-pids-admin --commit-dirty=true --branch=master
        
        if ($LASTEXITCODE -eq 0) {
            Write-Host "Pages deployed successfully (production: master)." -ForegroundColor Green
        } else {
            Write-Host "Pages deployment may have failed, please check the output above." -ForegroundColor Yellow
        }
    } else {
        Write-Host "admin.html not found, skipping Pages deployment." -ForegroundColor Yellow
    }
    
    Write-Host ""
    Write-Host "========================================" -ForegroundColor Cyan
    Write-Host "Deployment finished." -ForegroundColor Green
    Write-Host "========================================" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "Result:" -ForegroundColor Cyan
    Write-Host "   Worker:  https://metro.tanzhouxiang.dpdns.org" -ForegroundColor White
    Write-Host "   API docs: https://metro.tanzhouxiang.dpdns.org/" -ForegroundColor White
    Write-Host "   Admin (Pages): https://metro-pids-admin.pages.dev" -ForegroundColor White
    Write-Host ""
    Write-Host "Tips:" -ForegroundColor Cyan
    Write-Host "   - If you deployed Pages, the final admin domain may be an alias (for example master.*)." -ForegroundColor White
    Write-Host "   - You can see detailed deployment logs in Cloudflare Dashboard." -ForegroundColor White
    Write-Host ""
}

catch {
    Write-Host ""
    Write-Host "Error during deployment: $($_)" -ForegroundColor Red
    exit 1
}
finally {
    Pop-Location
}
