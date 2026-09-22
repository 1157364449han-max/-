@echo off
chcp 65001>nul
title 董解析 - 检查更新
py -3 "%~dp0检查更新.py"
echo.
pause
