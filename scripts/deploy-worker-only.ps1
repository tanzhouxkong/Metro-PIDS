# Deploy Cloudflare Worker and Pages
# Note: Must run without administrator privileges

# Set console output encoding to UTF-8
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Deploy Cloudflare Worker and Pages" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Check if wrangler is installed
Write-Host "Checking wrangler..." -ForegroundColor Yellow
$wranglerInstalled = Get-Command wrangler -ErrorAction SilentlyContinue

if (-not $wranglerInstalled) {
    Write-Host "wrangler not installed" -ForegroundColor Red
    Write-Host "Installing wrangler..." -ForegroundColor Yellow
    npm install -g wrangler
    if ($LASTEXITCODE -ne 0) {
        Write-Host "Installation failed, please run manually: npm install -g wrangler" -ForegroundColor Red
        exit 1
    }
} else {
    Write-Host "wrangler is installed" -ForegroundColor Green
}

Write-Host ""
Write-Host "Checking login status..." -ForegroundColor Yellow
$wranglerWhoami = wrangler whoami 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "Not logged in to Cloudflare" -ForegroundColor Yellow
    Write-Host "Opening login flow..." -ForegroundColor Yellow
    wrangler login
    if ($LASTEXITCODE -ne 0) {
        Write-Host "Login failed" -ForegroundColor Red
        exit 1
    }
} else {
    Write-Host "Logged in: $wranglerWhoami" -ForegroundColor Green
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Starting deployment..." -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Navigate to cloudflare directory
$cloudflareDir = Join-Path $PSScriptRoot "..\cloudflare"
if (-not (Test-Path $cloudflareDir)) {
    Write-Host "Cloudflare directory not found: $cloudflareDir" -ForegroundColor Red
    exit 1
}

Push-Location $cloudflareDir

# Step 1: Deploy Worker
Write-Host "Step 1/2: Deploying Cloudflare Worker..." -ForegroundColor Yellow
wrangler deploy

if ($LASTEXITCODE -ne 0) {
    Write-Host ""
    Write-Host "Worker deployment failed" -ForegroundColor Red
    Write-Host ""
    Write-Host "Possible reasons:" -ForegroundColor Yellow
    Write-Host "  1. Running with administrator privileges (run as normal user)" -ForegroundColor White
    Write-Host "  2. Network connection issue" -ForegroundColor White
    Write-Host "  3. Cloudflare configuration error" -ForegroundColor White
    Write-Host ""
    Pop-Location
    exit 1
}

Write-Host "Worker deployed successfully!" -ForegroundColor Green
Write-Host ""

# Step 2: Deploy Pages (admin.html)
Write-Host "Step 2/2: Deploying Cloudflare Pages (Admin UI)..." -ForegroundColor Yellow
$adminHtmlPath = Join-Path $cloudflareDir "admin.html"
if (Test-Path $adminHtmlPath) {
    $pagesResult = wrangler pages deploy . --project-name=metro-pids-admin --commit-dirty=true
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host "Pages deployed successfully!" -ForegroundColor Green
    } else {
        Write-Host "Pages deployment may have failed, please check error messages" -ForegroundColor Yellow
    }
} else {
    Write-Host "admin.html not found, skipping Pages deployment" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "Deployment completed!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""
Write-Host "Deployment addresses:" -ForegroundColor Cyan
Write-Host "  API: https://metro.tanzhouxiang.dpdns.org/" -ForegroundColor White
Write-Host "  Admin: https://metro-pids-admin.pages.dev" -ForegroundColor White
Write-Host ""
Write-Host "Tips:" -ForegroundColor Cyan
Write-Host "  - Test API: curl https://metro.tanzhouxiang.dpdns.org/" -ForegroundColor White
Write-Host "  - View logs: wrangler tail" -ForegroundColor White
Write-Host ""

Pop-Location
