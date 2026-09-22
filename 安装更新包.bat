@echo off
chcp 65001>nul
title 董解析 - 安装更新包
echo 更新前请关闭董解析的启动窗口，并仅选择可信来源的更新包。
if "%~1"=="" (
    py -3 -B -X utf8 "%~dp0检查更新.py" --choose
) else (
    py -3 -B -X utf8 "%~dp0检查更新.py" --file "%~1"
)
echo.
pause
