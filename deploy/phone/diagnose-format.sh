#!/data/data/com.termux/files/usr/bin/bash
set -euo pipefail
export HOME=/data/data/com.termux/files/home
export PREFIX=/data/data/com.termux/files/usr
export PATH="$PREFIX/bin:/system/bin"
set -a
. "$HOME/dongjiexi/private.env"
set +a
exec python "$HOME/dongjiexi/diagnose-format.py"
