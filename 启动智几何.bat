@echo off
chcp 65001>nul
title 董解析
cd /d "%~dp0"
rem 正常用户入口使用正式网页；仅保留管理员的既有本地服务启动方式。
if /i not "%~1"=="--local" goto web
where py >nul 2>nul
if errorlevel 1 goto web
py -3 -B -c "import sympy" >nul 2>nul
if errorlevel 1 goto web
py -3 -B -X utf8 server.py --open
if errorlevel 1 goto web
goto :eof

:web
echo 当前设备无需安装 Python 或其它运行环境，正在打开董解析正式网页。
echo 可在浏览器中安装为桌面应用；已缓存的画板和题稿也可离线使用。
start "" "https://dongjiexi.github.io/-/"
