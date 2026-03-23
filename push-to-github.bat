@echo off
chcp 65001 >nul
echo 正在检查Git状态...
cd /d "%~dp0"

:: 尝试找到git.exe
set GIT_CMD=
if exist "C:\Program Files\Git\cmd\git.exe" set GIT_CMD="C:\Program Files\Git\cmd\git.exe"
if exist "C:\Program Files (x86)\Git\cmd\git.exe" set GIT_CMD="C:\Program Files (x86)\Git\cmd\git.exe"
if exist "%LOCALAPPDATA%\Programs\Git\cmd\git.exe" set GIT_CMD="%LOCALAPPDATA%\Programs\Git\cmd\git.exe"

if "%GIT_CMD%"=="" (
    echo 错误: 未找到Git，请先安装Git或GitHub Desktop
    echo 下载地址: https://git-scm.com/download/win
    pause
    exit /b 1
)

echo 使用Git: %GIT_CMD%
echo.

echo [1/4] 添加所有更改的文件...
%GIT_CMD% add .
if errorlevel 1 (
    echo 错误: git add 失败
    pause
    exit /b 1
)

echo [2/4] 提交更改...
%GIT_CMD% commit -m "修复C型线路图站名显示和箭头间隔问题，以及到达站/下一站标签居中"
if errorlevel 1 (
    echo 警告: git commit 失败，可能没有需要提交的更改
)

echo [3/4] 推送到GitHub...
%GIT_CMD% push origin main
if errorlevel 1 (
    echo 错误: git push 失败
    echo 请检查网络连接和GitHub认证
    pause
    exit /b 1
)

echo.
echo ✓ 成功推送到GitHub!
echo 仓库地址: https://github.com/tanzhouxkong/Metro-PIDS
pause
