#!/data/data/com.termux/files/usr/bin/bash
set -euo pipefail
export HOME=/data/data/com.termux/files/home
export PREFIX=/data/data/com.termux/files/usr
export PATH="$PREFIX/bin:/system/bin"
export GIT_SSH_COMMAND="ssh -i $HOME/.ssh/dongjiexi_deploy -o IdentitiesOnly=yes -o StrictHostKeyChecking=yes -o UserKnownHostsFile=$HOME/.ssh/known_hosts"
repo="$HOME/dongjiexi/endpoint-sync-repo"
git -C "$repo" fetch "$HOME/dongjiexi/132dc01.bundle" main
git -C "$repo" merge --ff-only FETCH_HEAD
git -C "$repo" push origin main
