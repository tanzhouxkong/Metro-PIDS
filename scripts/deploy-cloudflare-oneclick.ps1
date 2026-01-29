# Metro-PIDS Cloudflare One-Click Deployment Script
# Auto deploy Worker and Pages without interaction

# Set console encoding to UTF-8
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8

# Color output functions
function Write-ColorOutput {
    param(
        [ConsoleColor]$ForegroundColor,
        [string]$Message
    )
    $fc = $host.UI.RawUI.ForegroundColor
    $host.UI.RawUI.ForegroundColor = $ForegroundColor
    Write-Output $Message
    $host.UI.RawUI.ForegroundColor = $fc
}

function Write-Success { 
    param([string]$Message)
    Write-ColorOutput -ForegroundColor Green -Message $Message
}

function Write-ErrorMsg { 
    param([string]$Message)
    Write-ColorOutput -ForegroundColor Red -Message $Message
}

function Write-Info { 
    param([string]$Message)
    Write-ColorOutput -ForegroundColor Cyan -Message $Message
}

function Write-WarningMsg { 
    param([string]$Message)
    Write-ColorOutput -ForegroundColor Yellow -Message $Message
}

Write-Info "========================================"
Write-Info "Metro-PIDS Cloudflare Deployment"
Write-Info "========================================"
Write-Host ""

# Get script directory
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectRoot = Split-Path -Parent $ScriptDir
$CloudflareDir = Join-Path $ProjectRoot "cloudflare"

# Check if cloudflare directory exists
if (-not (Test-Path $CloudflareDir)) {
    Write-ErrorMsg "Error: Cannot find cloudflare directory: $CloudflareDir"
    exit 1
}

# 1. Check if wrangler is installed
Write-Info "Checking wrangler..."
$wranglerInstalled = Get-Command wrangler -ErrorAction SilentlyContinue

if (-not $wranglerInstalled) {
    Write-WarningMsg "Warning: wrangler not installed, installing now..."
    npm install -g wrangler
    if ($LASTEXITCODE -ne 0) {
        Write-ErrorMsg "Error: Failed to install wrangler, please run manually: npm install -g wrangler"
        exit 1
    }
    Write-Success "Success: wrangler installed"
} else {
    Write-Success "Success: wrangler is installed"
}

Write-Host ""

# 2. Check Cloudflare login status
Write-Info "Checking Cloudflare login status..."
$wranglerWhoami = wrangler whoami 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-WarningMsg "Warning: Not logged in to Cloudflare, logging in now..."
    wrangler login
    if ($LASTEXITCODE -ne 0) {
        Write-ErrorMsg "Error: Login failed, please run manually: wrangler login"
        exit 1
    }
    Write-Success "Success: Logged in"
} else {
    Write-Success "Success: Already logged in: $($wranglerWhoami -join ' ')"
}

Write-Host ""
Write-Info "========================================"
Write-Info "Starting deployment..."
Write-Info "========================================"
Write-Host ""

# Change to cloudflare directory
Push-Location $CloudflareDir

try {
    $deploySuccess = $true
    
    # 3. Deploy Worker
    Write-Info "Deploying Cloudflare Worker..."
    wrangler deploy
    
    if ($LASTEXITCODE -eq 0) {
        Write-Success "Success: Worker deployed successfully!"
    } else {
        Write-ErrorMsg "Error: Worker deployment failed"
        $deploySuccess = $false
    }
    
    Write-Host ""
    
    # 4. Deploy Pages (if admin.html exists)
    $adminHtmlPath = Join-Path $CloudflareDir "admin.html"
    if (Test-Path $adminHtmlPath) {
        Write-Info "Deploying Cloudflare Pages..."
        wrangler pages deploy . --project-name=metro-pids-admin --commit-dirty=true
        
        if ($LASTEXITCODE -eq 0) {
            Write-Success "Success: Pages deployed successfully!"
        } else {
            Write-WarningMsg "Warning: Pages deployment may have failed, please check error messages"
        }
    } else {
        Write-WarningMsg "Warning: admin.html not found, skipping Pages deployment"
    }
    
    Write-Host ""
    Write-Info "========================================"
    
    if ($deploySuccess) {
        Write-Success "Success: Deployment completed!"
    } else {
        Write-ErrorMsg "Error: Deployment encountered errors"
    }
    
    Write-Info "========================================"
    Write-Host ""
    
    Write-Info "Deployment URLs:"
    Write-Host "   Worker API:  https://metro.tanzhouxiang.dpdns.org" -ForegroundColor White
    Write-Host "   Admin Panel: https://metro-pids-admin.pages.dev" -ForegroundColor White
    Write-Host ""
    
} catch {
    Write-Host ""
    Write-ErrorMsg "Error: Deployment failed: $_"
    exit 1
} finally {
    Pop-Location
}

Write-Host ""
Write-Info "Tip: You can view detailed deployment logs in Cloudflare Dashboard"
Write-Host ""
