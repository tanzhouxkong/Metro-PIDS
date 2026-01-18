@echo off
chcp 65001 >nul 2>&1
REM Verify Cloudflare Worker Deployment

echo ========================================
echo Verify Cloudflare Worker Deployment
echo ========================================
echo.

set "SCRIPT_DIR=%~dp0"
set "PS_SCRIPT=%SCRIPT_DIR%verify-deployment.ps1"

REM Check if PowerShell is available
where pwsh >nul 2>&1
if %ERRORLEVEL% equ 0 (
    pwsh -ExecutionPolicy Bypass -File "%PS_SCRIPT%"
    goto :end
)

where powershell >nul 2>&1
if %ERRORLEVEL% equ 0 (
    powershell -ExecutionPolicy Bypass -File "%PS_SCRIPT%"
    goto :end
)

echo [Error] PowerShell not found
echo Please visit https://metro.tanzhouxiang.dpdns.org/ to verify deployment manually
pause
exit /b 1

:end
if %ERRORLEVEL% equ 0 (
    echo.
    echo Verification completed!
) else (
    echo.
    echo [Error] Verification failed, please check the error messages above
)
pause
