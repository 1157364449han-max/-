#!/data/data/com.termux/files/usr/bin/bash
set -euo pipefail
export HOME=/data/data/com.termux/files/home
export PREFIX=/data/data/com.termux/files/usr
export PATH="$PREFIX/bin:/system/bin"
cd "$HOME/dongjiexi"
while true; do
  if curl --silent --fail --max-time 3 http://127.0.0.1:8765/api/health >/dev/null; then
    if [ ! -f tunnel.pid ] || ! kill -0 "$(cat tunnel.pid)" 2>/dev/null; then
      bash "$HOME/dongjiexi/launch-test-tunnel.sh"
      sleep 12
    fi
    bash "$HOME/dongjiexi/sync-phone-endpoint.sh" || echo '地址同步暂未成功，稍后重试。' >&2
  fi
  sleep 60
done

