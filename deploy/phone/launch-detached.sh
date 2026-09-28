#!/data/data/com.termux/files/usr/bin/bash
set -euo pipefail
export HOME=/data/data/com.termux/files/home
export PREFIX=/data/data/com.termux/files/usr
export PATH="$PREFIX/bin:/system/bin"
cd "$HOME/dongjiexi"
umask 077
if curl --silent --fail --max-time 2 http://127.0.0.1:8765/api/health >/dev/null; then
  echo '董解析已运行。'
  exit 0
fi
setsid "$HOME/dongjiexi/start.sh" > "$HOME/dongjiexi/app.log" 2>&1 < /dev/null &
echo $! > "$HOME/dongjiexi/server.pid"
echo '已在手机后台启动董解析。'

