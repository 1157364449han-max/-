@echo off
chcp 65001>nul
cd /d "%~dp0"
echo 董解析将允许同一 Wi-Fi 下的手机临时访问。请记下随后显示的本机 IP 和端口 8765。
echo 此模式依赖电脑保持开机，只能用于家庭或课堂的可信私人网络，禁止直接开放到公网。
py -3 -B -X utf8 server.py --lan
