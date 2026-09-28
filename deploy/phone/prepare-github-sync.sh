#!/data/data/com.termux/files/usr/bin/bash
set -euo pipefail
export HOME=/data/data/com.termux/files/home
export PREFIX=/data/data/com.termux/files/usr
export PATH="$PREFIX/bin:/system/bin"
umask 077
mkdir -p "$HOME/.ssh"
if [ ! -f "$HOME/.ssh/dongjiexi_deploy" ]; then
  ssh-keygen -q -t ed25519 -N '' -C 'dongjiexi-phone-endpoint-sync' -f "$HOME/.ssh/dongjiexi_deploy"
fi
printf '%s\n' 'github.com ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIOMqqnkVzrm0SdG6UOoqKLsabgH5C9okWi0dh2l9GKJl' > "$HOME/.ssh/known_hosts"
chmod 600 "$HOME/.ssh/dongjiexi_deploy" "$HOME/.ssh/known_hosts"
cat "$HOME/.ssh/dongjiexi_deploy.pub"

