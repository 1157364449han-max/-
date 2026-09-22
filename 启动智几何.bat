@echo off
chcp 65001>nul
title 董解析
cd /d "%~dp0"
py -3 -B -X utf8 server.py --open
