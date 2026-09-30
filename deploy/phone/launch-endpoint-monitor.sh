#!/data/data/com.termux/files/usr/bin/bash
set -euo pipefail
export HOME=/data/data/com.termux/files/home
export PREFIX=/data/data/com.termux/files/usr
export PATH="$PREFIX/bin:/system/bin"
cd "$HOME/dongjiexi"
if python service-supervisor.py --root "$HOME/dongjiexi" --is-running monitor; then
  echo '地址同步监控已运行。'
  exit 0
fi
setsid bash "$HOME/dongjiexi/monitor-phone-endpoint.sh" >> endpoint-monitor.log 2>&1 < /dev/null &
echo $! > endpoint-monitor.pid
echo '地址同步监控已启动。'
