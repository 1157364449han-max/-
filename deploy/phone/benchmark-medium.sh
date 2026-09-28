#!/data/data/com.termux/files/usr/bin/bash
set -euo pipefail
export HOME=/data/data/com.termux/files/home
export PREFIX=/data/data/com.termux/files/usr
export PATH="$PREFIX/bin:/system/bin"
set -a
. "$HOME/dongjiexi/private.env"
set +a
if [ -n "${1:-}" ] && [[ "${1:-}" != https://* ]]; then
  export DONGJIEXI_MODEL_ID="$1"
fi
if [[ "${1:-}" == https://* ]]; then
  export DONGJIEXI_BENCHMARK_BASE="$1"
elif [[ "${2:-}" == https://* ]]; then
  export DONGJIEXI_BENCHMARK_BASE="$2"
fi
exec python "$HOME/dongjiexi/benchmark-medium.py"
