@echo off
chcp 65001 >nul 2>&1
REM Metro-PIDS Version Update Publisher (Interactive)
REM Interactive version that prompts for input

setlocal enabledelayedexpansion

set "SCRIPT_DIR=%~dp0"
set "NODE_SCRIPT=%SCRIPT_DIR%publish-update.js"

echo ========================================
echo Metro-PIDS Version Update Publisher
echo Interactive Mode
echo ========================================
echo.

REM Check if Node.js is available
where node >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo [Error] Node.js not found
    echo Please install Node.js or add it to PATH
    pause
    exit /b 1
)

REM Check if script file exists
if not exist "%NODE_SCRIPT%" (
    echo [Error] Script not found: %NODE_SCRIPT%
    pause
    exit /b 1
)

REM Prompt for file path
set /p FILE_PATH="Enter installer file path: "
if "!FILE_PATH!"=="" (
    echo [Error] File path is required
    pause
    exit /b 1
)

REM Check if file exists
if not exist "!FILE_PATH!" (
    echo [Error] File not found: !FILE_PATH!
    pause
    exit /b 1
)

REM Prompt for version
set /p VERSION="Enter version number (e.g., 1.5.5): "
if "!VERSION!"=="" (
    echo [Error] Version is required
    pause
    exit /b 1
)

REM Prompt for platform (optional)
set /p PLATFORM="Enter platform (win32/darwin/linux, default: win32): "
if "!PLATFORM!"=="" set "PLATFORM=win32"

REM Prompt for architecture (optional)
set /p ARCH="Enter architecture (x64/arm64, default: x64): "
if "!ARCH!"=="" set "ARCH=x64"

REM Prompt for minimum version (optional)
set /p MIN_VERSION="Enter minimum required version (optional, press Enter to skip): "

REM Prompt for force update (optional)
set /p FORCE_UPDATE="Force update all versions? (y/N): "
if /i "!FORCE_UPDATE!"=="y" (
    set "FORCE_FLAG=--force-update"
) else (
    set "FORCE_FLAG="
)

REM Prompt for changelog title (optional)
set /p CHANGELOG_TITLE="Enter changelog title (optional, press Enter to skip): "

REM Prompt for changelog content (optional)
set /p CHANGELOG_CONTENT="Enter changelog content (Markdown, optional, press Enter to skip): "

echo.
echo ========================================
echo Summary
echo ========================================
echo File: !FILE_PATH!
echo Version: !VERSION!
echo Platform: !PLATFORM!
echo Architecture: !ARCH!
if not "!MIN_VERSION!"=="" echo Minimum Version: !MIN_VERSION!
if not "!FORCE_FLAG!"=="" echo Force Update: Yes
if not "!CHANGELOG_TITLE!"=="" echo Changelog Title: !CHANGELOG_TITLE!
echo ========================================
echo.

set /p CONFIRM="Proceed with publishing? (Y/n): "
if /i "!CONFIRM!"=="n" (
    echo Cancelled.
    pause
    exit /b 0
)

echo.
echo Publishing update...
echo.

REM Build command
set "CMD=node "%NODE_SCRIPT%" --file "!FILE_PATH!" --version !VERSION! --platform !PLATFORM! --arch !ARCH!"

if not "!MIN_VERSION!"=="" set "CMD=!CMD! --minimum-version !MIN_VERSION!"
if not "!FORCE_FLAG!"=="" set "CMD=!CMD! !FORCE_FLAG!"
if not "!CHANGELOG_TITLE!"=="" set "CMD=!CMD! --changelog-title "!CHANGELOG_TITLE!""
if not "!CHANGELOG_CONTENT!"=="" set "CMD=!CMD! --changelog-content "!CHANGELOG_CONTENT!""

REM Execute command
!CMD!

if %ERRORLEVEL% equ 0 (
    echo.
    echo ========================================
    echo Update published successfully!
    echo ========================================
    echo.
    echo Next steps:
    echo   1. Upload installer file to CDN or R2 storage
    echo   2. Verify version info in admin panel
    echo   3. Test update check in client
    echo.
) else (
    echo.
    echo ========================================
    echo [Error] Update publishing failed
    echo ========================================
    echo.
    echo Please check the error messages above
    echo.
)

pause
