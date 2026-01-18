@echo off
chcp 65001 >nul 2>&1
REM Wrapper for scripts\publish-update.ps1
REM Keep this file ASCII/ANSI to avoid CMD encoding issues.

setlocal
set "SCRIPT_DIR=%~dp0"
set "PS_SCRIPT=%SCRIPT_DIR%publish-update.ps1"

if not exist "%PS_SCRIPT%" (
  echo [ERROR] Missing PowerShell script: "%PS_SCRIPT%"
  echo.
  pause
  exit /b 1
)

where pwsh >nul 2>&1
if %ERRORLEVEL% equ 0 (
  pwsh -NoProfile -ExecutionPolicy Bypass -File "%PS_SCRIPT%" %*
  set "EXIT_CODE=%ERRORLEVEL%"
  echo.
  if not "%EXIT_CODE%"=="0" echo [ERROR] Failed, exit code=%EXIT_CODE%
  pause
  exit /b %EXIT_CODE%
)

where powershell >nul 2>&1
if %ERRORLEVEL% equ 0 (
  REM Windows PowerShell 5.1 may mis-detect UTF-8 script encoding.
  REM Read file as UTF-8 explicitly, then execute it.
  set "METRO_PIDS_PUBLISH_UPDATE_PS1=%PS_SCRIPT%"
  powershell -NoProfile -ExecutionPolicy Bypass -Command "$p=$env:METRO_PIDS_PUBLISH_UPDATE_PS1; $code=[System.IO.File]::ReadAllText($p,[System.Text.Encoding]::UTF8); $code=$code.TrimStart([char]0xFEFF); iex $code" %*
  set "EXIT_CODE=%ERRORLEVEL%"
  echo.
  if not "%EXIT_CODE%"=="0" echo [ERROR] Failed, exit code=%EXIT_CODE%
  pause
  exit /b %EXIT_CODE%
)

echo [ERROR] PowerShell not found (pwsh/powershell).
pause
exit /b 1
