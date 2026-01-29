@echo off
chcp 65001 >nul 2>&1
REM Metro-PIDS Cloudflare Deployment Script (Windows)
REM Deploy Cloudflare Worker and Pages

echo ========================================
echo Metro-PIDS Cloudflare Deployment Script
echo ========================================
echo.

set "SCRIPT_DIR=%~dp0"
set "PS_SCRIPT=%SCRIPT_DIR%deploy-cloudflare.ps1"

REM Check if PowerShell is available
where pwsh >nul 2>&1
if %ERRORLEVEL% equ 0 (
    echo Using PowerShell Core...
    pwsh -ExecutionPolicy Bypass -File "%PS_SCRIPT%"
    goto :end
)

where powershell >nul 2>&1
if %ERRORLEVEL% equ 0 (
    echo Using Windows PowerShell...
    powershell -ExecutionPolicy Bypass -File "%PS_SCRIPT%"
    goto :end
)

echo [Error] PowerShell not found
echo Please install PowerShell or run deployment commands manually
pause
exit /b 1

:end
if %ERRORLEVEL% equ 0 (
    echo.
    echo Deployment completed!
) else (
    echo.
    echo [Error] Deployment failed, please check the error messages above
)
pause
