# Metro-PIDS 版本更新发布脚本（推荐入口：publish-update.bat）
# 说明：
# - 这里用 PowerShell 实现全部逻辑和中文输出，避免 .bat 编码问题导致“闪退/乱命令”
# - 参数风格保持与之前 bat 一致（--win/--mac/--linux 等）

[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8

function Get-ScriptDir {
  # 正常情况下（-File 执行）优先使用 $PSScriptRoot / $PSCommandPath。
  # 兼容：通过 iex 执行时，$PSScriptRoot/$PSCommandPath 可能为空。
  $scriptPath = $null

  try { if ($PSCommandPath) { $scriptPath = $PSCommandPath } } catch {}
  try { if (-not $scriptPath -and $MyInvocation.MyCommand.Path) { $scriptPath = $MyInvocation.MyCommand.Path } } catch {}
  if (-not $scriptPath) { $scriptPath = $env:METRO_PIDS_PUBLISH_UPDATE_PS1 }

  if ($scriptPath) {
    try { return (Split-Path -Parent $scriptPath) } catch {}
  }

  if ($PSScriptRoot) { return $PSScriptRoot }
  return (Get-Location).Path
}

function Show-Help {
  Write-Host ""
  Write-Host "使用方法：" -ForegroundColor Cyan
  Write-Host "  scripts\publish-update.bat [选项]" -ForegroundColor White
  Write-Host ""
  Write-Host "选项：" -ForegroundColor Cyan
  Write-Host "  --win                    构建 Windows 版本（默认）" -ForegroundColor White
  Write-Host "  --mac                    构建 macOS 版本" -ForegroundColor White
  Write-Host "  --linux                  构建 Linux 版本" -ForegroundColor White
  Write-Host "  --skip-build             跳过 electron-builder 构建/发布" -ForegroundColor White
  Write-Host "  --skip-upload            跳过 Cloudflare 版本信息上传" -ForegroundColor White
  Write-Host "  --version (版本)         指定版本号（默认从 package.json 读取）" -ForegroundColor White
  Write-Host "  --minimum-version (版本) 最低要求版本（低于此版本强制更新）" -ForegroundColor White
  Write-Host "  --force-update           强制所有版本更新" -ForegroundColor White
  Write-Host "  --changelog-title (标题) 更新日志标题" -ForegroundColor White
  Write-Host "  --changelog-content (内容) 更新日志内容（支持 Markdown）" -ForegroundColor White
  Write-Host "  --help                   显示帮助" -ForegroundColor White
  Write-Host ""
  Write-Host "示例：" -ForegroundColor Cyan
  Write-Host "  scripts\publish-update.bat --win" -ForegroundColor White
  Write-Host "  scripts\publish-update.bat --win --version 1.5.5" -ForegroundColor White
  Write-Host "  scripts\publish-update.bat --win --skip-build" -ForegroundColor White
  Write-Host ""
}

function Fail([string]$Message, [int]$Code = 1) {
  Write-Host ""
  Write-Host "[失败] $Message" -ForegroundColor Red
  exit $Code
}

# ---- 参数解析（兼容 --xxx 风格） ----
# 说明：不用 switch，避免某些环境/编码下出现解析器误判“仍在 switch 块中”的报错。
$opt = [ordered]@{
  platform         = "win"   # win/mac/linux
  skipBuild        = $false
  skipUpload       = $false
  version          = $null
  minimumVersion   = $null
  forceUpdate      = $false
  changelogTitle   = $null
  changelogContent = $null
}

$i = 0
while ($i -lt $args.Count) {
  $a = [string]$args[$i]

  if ($a -eq '--win') { $opt.platform = 'win'; $i++; continue }
  if ($a -eq '--mac') { $opt.platform = 'mac'; $i++; continue }
  if ($a -eq '--linux') { $opt.platform = 'linux'; $i++; continue }
  if ($a -eq '--skip-build') { $opt.skipBuild = $true; $i++; continue }
  if ($a -eq '--skip-upload') { $opt.skipUpload = $true; $i++; continue }
  if ($a -eq '--force-update') { $opt.forceUpdate = $true; $i++; continue }

  if ($a -eq '--version') {
    $i++
    if ($i -ge $args.Count) { Fail "参数 --version 缺少值" }
    $opt.version = [string]$args[$i]
    $i++
    continue
  }

  if ($a -eq '--minimum-version') {
    $i++
    if ($i -ge $args.Count) { Fail "参数 --minimum-version 缺少值" }
    $opt.minimumVersion = [string]$args[$i]
    $i++
    continue
  }

  if ($a -eq '--changelog-title') {
    $i++
    if ($i -ge $args.Count) { Fail "参数 --changelog-title 缺少值" }
    $opt.changelogTitle = [string]$args[$i]
    $i++
    continue
  }

  if ($a -eq '--changelog-content') {
    $i++
    if ($i -ge $args.Count) { Fail "参数 --changelog-content 缺少值" }
    $opt.changelogContent = [string]$args[$i]
    $i++
    continue
  }

  if ($a -eq '--help') { Show-Help; exit 0 }

  Write-Host "[提示] 未识别参数：$a（已忽略）" -ForegroundColor Yellow
  $i++
}

$scriptDir = Get-ScriptDir
$projectRoot = (Resolve-Path (Join-Path $scriptDir "..")).Path
$publishJs = (Join-Path $scriptDir "publish-update.js")
$distDir = Join-Path $projectRoot "dist"

if (-not (Test-Path $publishJs)) {
  Fail "找不到脚本：$publishJs"
}
if (-not (Test-Path (Join-Path $projectRoot "package.json"))) {
  Fail "找不到 package.json：$projectRoot"
}

# ---- 读取版本号 ----
if (-not $opt.version) {
  try {
    $pkg = Get-Content (Join-Path $projectRoot "package.json") -Raw -Encoding UTF8 | ConvertFrom-Json
    $opt.version = [string]$pkg.version
  } catch {
    Fail "读取 package.json 版本号失败：$($_.Exception.Message)"
  }
}

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Metro-PIDS 一键发布更新" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "平台：$($opt.platform)    版本：$($opt.version)" -ForegroundColor White
Write-Host ""

# ---- 环境检查 ----
if (-not (Get-Command node -ErrorAction SilentlyContinue)) { Fail "未找到 Node.js（node）" }
if (-not (Get-Command npx -ErrorAction SilentlyContinue)) { Fail "未找到 npx（请安装 npm / Node.js 完整版）" }

# 用系统 CA 解决部分网络环境 SSL 问题（可按需删除）
$env:NODE_OPTIONS = "--use-system-ca"

# ---- 1) electron-builder 构建并发布到 GitHub Releases ----
if (-not $opt.skipBuild) {
  Write-Host "步骤 1/2：electron-builder 构建并发布..." -ForegroundColor Yellow
  Push-Location $projectRoot
  try {
    if ($opt.platform -eq "win") {
      & npx electron-builder --publish=always --win
    } elseif ($opt.platform -eq "mac") {
      & npx electron-builder --publish=always --mac
    } elseif ($opt.platform -eq "linux") {
      & npx electron-builder --publish=always --linux
    } else {
      Fail "未知平台：$($opt.platform)"
    }

    if ($LASTEXITCODE -ne 0) { Fail "electron-builder 构建失败（exit=$LASTEXITCODE）" $LASTEXITCODE }
  } finally {
    Pop-Location
  }

  Write-Host "[成功] 构建发布完成" -ForegroundColor Green
  Write-Host ""
} else {
  Write-Host "步骤 1/2：已跳过 electron-builder 构建/发布" -ForegroundColor Yellow
  Write-Host ""
}

# ---- 2) 上传版本信息到 Cloudflare Worker（调用 publish-update.js） ----
if ($opt.skipUpload) {
  Write-Host "步骤 2/2：已跳过 Cloudflare 版本信息上传" -ForegroundColor Yellow
  exit 0
}

Write-Host "步骤 2/2：上传版本信息到 Cloudflare..." -ForegroundColor Yellow

if (-not (Test-Path $distDir)) {
  Fail "找不到 dist 目录：$distDir（请先构建）"
}

# 找最新安装包
$pattern =
  if ($opt.platform -eq "win") { "Metro-PIDS-Setup-*.exe" }
  elseif ($opt.platform -eq "mac") { "Metro-PIDS-*.dmg" }
  elseif ($opt.platform -eq "linux") { "Metro-PIDS-*.AppImage" }
  else { $null }

if (-not $pattern) { Fail "未知平台：$($opt.platform)" }

$installer = Get-ChildItem -Path $distDir -Filter $pattern -File -ErrorAction SilentlyContinue |
  Sort-Object LastWriteTime -Descending |
  Select-Object -First 1

if (-not $installer) {
  Fail "未在 dist 中找到安装包（匹配：$pattern）"
}

$buildPlatform =
  if ($opt.platform -eq "win") { "win32" }
  elseif ($opt.platform -eq "mac") { "darwin" }
  else { "linux" }

$buildArch = if ($installer.Name -match '(?i)arm64') { "arm64" } else { "x64" }

Write-Host "安装包：$($installer.FullName)" -ForegroundColor White
Write-Host "平台/架构：$buildPlatform / $buildArch" -ForegroundColor White
Write-Host ""

$nodeArgs = @(
  $publishJs,
  "--file", $installer.FullName,
  "--version", $opt.version,
  "--platform", $buildPlatform,
  "--arch", $buildArch
)
if ($opt.minimumVersion) { $nodeArgs += @("--minimum-version", $opt.minimumVersion) }
if ($opt.forceUpdate) { $nodeArgs += @("--force-update") }
if ($opt.changelogTitle) { $nodeArgs += @("--changelog-title", $opt.changelogTitle) }
if ($opt.changelogContent) { $nodeArgs += @("--changelog-content", $opt.changelogContent) }

Write-Host "执行：node $($nodeArgs -join ' ')" -ForegroundColor DarkGray
Write-Host ""

Push-Location $projectRoot
try {
  & node @nodeArgs
  if ($LASTEXITCODE -ne 0) { Fail "上传版本信息失败（exit=$LASTEXITCODE）" $LASTEXITCODE }
} finally {
  Pop-Location
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "[成功] 发布完成！" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host "提示：安装包上传/发布在 GitHub Releases；版本信息在 Cloudflare Worker/KV。" -ForegroundColor White

