#!/data/data/com.termux/files/usr/bin/bash
set -euo pipefail
export HOME=/data/data/com.termux/files/home
export PREFIX=/data/data/com.termux/files/usr
export PATH="$PREFIX/bin:/system/bin"
key="$(cat "$HOME/dongjiexi/model.key")"
set -a
. "$HOME/dongjiexi/private.env"
set +a
if [ "$key" = "$DONGJIEXI_MODEL_API_KEY" ]; then echo 'Model key file matches private configuration.'; else echo 'Model key mismatch.'; fi
curl --silent --show-error --max-time 10 -w '\nHTTP %{http_code}\n' \
  -H "Authorization: Bearer $key" http://127.0.0.1:8080/v1/models \
  | python -c 'import sys,json; raw=sys.stdin.read(); print(raw[:600])'
