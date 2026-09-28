#!/data/data/com.termux/files/usr/bin/bash
set -euo pipefail
export HOME=/data/data/com.termux/files/home
export PREFIX=/data/data/com.termux/files/usr
export PATH="$PREFIX/bin:/system/bin"
set -a
. "$HOME/dongjiexi/private.env"
set +a
export DONGJIEXI_MODEL_VISION=0
cd "$HOME/dongjiexi"
exec python server.py --host 127.0.0.1 --port 8765
