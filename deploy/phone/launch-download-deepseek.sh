#!/data/data/com.termux/files/usr/bin/bash
set -euo pipefail
export HOME=/data/data/com.termux/files/home
export PREFIX=/data/data/com.termux/files/usr
export PATH="$PREFIX/bin:/system/bin"
umask 077
setsid "$HOME/dongjiexi/download-deepseek.sh" > "$HOME/dongjiexi/deepseek-download.log" 2>&1 < /dev/null &
echo $! > "$HOME/dongjiexi/deepseek-download.pid"
echo 'DeepSeek 模型下载已在手机后台启动。'
