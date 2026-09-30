#!/data/data/com.termux/files/usr/bin/bash
set -euo pipefail
app_dir=/data/data/com.termux/files/home/dongjiexi
cd "$app_dir"
if [ -f cloud-endpoint.txt ] || [ -f cloudflared.token ]; then
  # Incomplete persistent configuration must never silently become a temporary URL.
  test -s cloud-endpoint.txt && test -s cloudflared.token
  python service-supervisor.py --root "$app_dir" --endpoint >/dev/null
  chmod 600 cloudflared.token
  umask 077
  setsid cloudflared tunnel --no-autoupdate --protocol http2 run --token-file "$app_dir/cloudflared.token" > tunnel.log 2>&1 < /dev/null &
  echo $! > tunnel.pid
  echo '固定隧道启动中；令牌仅保存在私有文件中。'
else
  exec bash "$app_dir/launch-test-tunnel.sh"
fi
