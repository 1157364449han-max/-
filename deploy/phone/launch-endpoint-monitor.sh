#!/data/data/com.termux/files/usr/bin/bash
set -euo pipefail
export HOME=/data/data/com.termux/files/home
export PREFIX=/data/data/com.termux/files/usr
export PATH="$PREFIX/bin:/system/bin"
cd "$HOME/dongjiexi"
if [ -f endpoint-monitor.pid ] && kill -0 "$(cat endpoint-monitor.pid)" 2>/dev/null; then
  echo '地址同步监控已运行。'
  exit 0
fi
setsid "$HOME/dongjiexi/monitor-phone-endpoint.sh" >> endpoint-monitor.log 2>&1 < /dev/null &
echo $! > endpoint-monitor.pid
echo '地址同步监控已启动。'
