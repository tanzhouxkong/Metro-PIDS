@echo off
setlocal
cd /d "%~dp0.."
powershell -NoProfile -ExecutionPolicy Bypass -File ".\scripts\fix-conflict-markers.ps1" -Root ".\src\locales" -Mode smart -Apply
pause
