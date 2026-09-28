#!/data/data/com.termux/files/usr/bin/bash
set -euo pipefail
export HOME=/data/data/com.termux/files/home
export PREFIX=/data/data/com.termux/files/usr
export PATH="$PREFIX/bin:/system/bin"
export GIT_SSH_COMMAND="ssh -i $HOME/.ssh/dongjiexi_deploy -o IdentitiesOnly=yes -o StrictHostKeyChecking=yes -o UserKnownHostsFile=$HOME/.ssh/known_hosts"
cd "$HOME/dongjiexi"
endpoint="$(grep -oE 'https://[a-z0-9-]+\.trycloudflare\.com' tunnel.log | head -n 1 || true)"
if [[ ! "$endpoint" =~ ^https://[a-z0-9-]+\.trycloudflare\.com$ ]]; then
  echo '隧道尚未提供有效 HTTPS 地址。' >&2
  exit 1
fi
curl --silent --show-error --fail --max-time 5 http://127.0.0.1:8765/api/health >/dev/null
repo="$HOME/dongjiexi/endpoint-sync-repo"
if [ ! -d "$repo/.git" ]; then
  git clone --depth 1 git@github.com:1157364449han-max/-.git "$repo"
fi
git -C "$repo" config user.name 'Dongjiexi phone endpoint sync'
git -C "$repo" config user.email 'phone-endpoint@users.noreply.github.com'
git -C "$repo" pull --ff-only origin main
current="$(tr -d '\r\n' < "$repo/deploy/active-phone-api.txt")"
if [ "$current" = "$endpoint" ]; then
  echo '公网地址未变，无需更新。'
  exit 0
fi
printf '%s\n' "$endpoint" > "$repo/deploy/active-phone-api.txt"
git -C "$repo" add -- deploy/active-phone-api.txt
git -C "$repo" commit -m 'Refresh live phone inference tunnel URL'
git -C "$repo" push origin main
echo '已更新 GitHub Pages 的手机服务地址。'

