# Deploy Cloudflare Pages (Admin UI)
# Note: Must run without administrator privileges

# Set console output encoding to UTF-8
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Deploy Cloudflare Pages (Admin UI)" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Check if wrangler is installed
Write-Host "📦 Checking wrangler..." -ForegroundColor Yellow
$wranglerInstalled = Get-Command wrangler -ErrorAction SilentlyContinue

if (-not $wranglerInstalled) {
    Write-Host "❌ wrangler not installed" -ForegroundColor Red
    Write-Host "Installing wrangler..." -ForegroundColor Yellow
    npm install -g wrangler
    if ($LASTEXITCODE -ne 0) {
        Write-Host "❌ Installation failed, please run: npm install -g wrangler" -ForegroundColor Red
        exit 1
    }
} else {
    Write-Host "✅ wrangler installed" -ForegroundColor Green
}

Write-Host ""
Write-Host "🔐 Checking login status..." -ForegroundColor Yellow
$wranglerWhoami = wrangler whoami 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "⚠️  Not logged in to Cloudflare" -ForegroundColor Yellow
    Write-Host "Opening login flow..." -ForegroundColor Yellow
    wrangler login
    if ($LASTEXITCODE -ne 0) {
        Write-Host "❌ Login failed" -ForegroundColor Red
        exit 1
    }
} else {
    Write-Host "✅ Logged in: $wranglerWhoami" -ForegroundColor Green
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Deploying Pages..." -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Navigate to cloudflare directory
$cloudflareDir = Join-Path $PSScriptRoot "..\cloudflare"
if (-not (Test-Path $cloudflareDir)) {
    Write-Host "❌ Cloudflare directory not found: $cloudflareDir" -ForegroundColor Red
    exit 1
}

Push-Location $cloudflareDir

try {
    # Check if admin.html exists
    $adminHtmlPath = Join-Path $cloudflareDir "admin.html"
    if (-not (Test-Path $adminHtmlPath)) {
        Write-Host "❌ admin.html not found: $adminHtmlPath" -ForegroundColor Red
        exit 1
    }
    
    Write-Host "📤 Deploying Pages..." -ForegroundColor Yellow
    Write-Host "   Project: metro-pids-admin" -ForegroundColor White
    Write-Host "   Directory: $cloudflareDir" -ForegroundColor White
    Write-Host ""
    
    # Deploy Pages
    wrangler pages deploy . --project-name=metro-pids-admin --commit-dirty=true
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host ""
        Write-Host "========================================" -ForegroundColor Green
        Write-Host "✅ Pages deployed successfully!" -ForegroundColor Green
        Write-Host "========================================" -ForegroundColor Green
        Write-Host ""
        Write-Host "📋 Deployment addresses:" -ForegroundColor Cyan
        Write-Host "   Admin UI: https://metro-pids-admin.pages.dev" -ForegroundColor White
        Write-Host "   Admin UI (with /admin): https://metro-pids-admin.pages.dev/admin" -ForegroundColor White
        Write-Host ""
        Write-Host "💡 Tips:" -ForegroundColor Cyan
        Write-Host "   - You can view deployment history in Cloudflare Dashboard" -ForegroundColor White
        Write-Host "   - To update, run this script again" -ForegroundColor White
        Write-Host ""
    } else {
        Write-Host ""
        Write-Host "❌ Deployment failed" -ForegroundColor Red
        Write-Host ""
        Write-Host "💡 Possible reasons:" -ForegroundColor Yellow
        Write-Host "   1. Project not created in Cloudflare Dashboard" -ForegroundColor White
        Write-Host "   2. Network connection issue" -ForegroundColor White
        Write-Host "   3. Running with administrator privileges (run as normal user)" -ForegroundColor White
        Write-Host ""
        Write-Host "   To create the project manually:" -ForegroundColor Yellow
        Write-Host "   1. Go to Cloudflare Dashboard > Pages" -ForegroundColor White
        Write-Host "   2. Create a new project named 'metro-pids-admin'" -ForegroundColor White
        Write-Host "   3. Or use: wrangler pages project create metro-pids-admin" -ForegroundColor White
        Write-Host ""
        exit 1
    }
} catch {
    Write-Host ""
    Write-Host "❌ Error during deployment: $_" -ForegroundColor Red
    exit 1
} finally {
    Pop-Location
}
