#!/data/data/com.termux/files/usr/bin/bash
# Temporary public address for testing only; not a production endpoint.
set -euo pipefail
export HOME=/data/data/com.termux/files/home
export PREFIX=/data/data/com.termux/files/usr
export PATH="$PREFIX/bin:/system/bin"
cd "$HOME/dongjiexi"
umask 077
setsid cloudflared tunnel --protocol http2 --url http://127.0.0.1:8765 > "$HOME/dongjiexi/tunnel.log" 2>&1 < /dev/null &
echo $! > "$HOME/dongjiexi/tunnel.pid"
echo '临时测试隧道启动中；地址见 tunnel.log。'

