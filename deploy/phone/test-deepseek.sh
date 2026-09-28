#!/data/data/com.termux/files/usr/bin/bash
set -euo pipefail
export HOME=/data/data/com.termux/files/home
export PREFIX=/data/data/com.termux/files/usr
export PATH="$PREFIX/bin:/system/bin"
key="$(cat "$HOME/dongjiexi/model.key")"
curl --silent --show-error --fail --max-time 300 \
  -H "Authorization: Bearer $key" -H 'Content-Type: application/json' \
  -d '{"model":"deepseek-r1-llama-8b","messages":[{"role":"user","content":"Answer only: what is 2+2?"}],"max_tokens":128,"stream":false}' \
  http://127.0.0.1:8082/v1/chat/completions \
  | python -c 'import json,sys; data=json.load(sys.stdin); choice=data["choices"][0]; message=choice["message"]; print("finish:",choice.get("finish_reason"),"content:",repr(message.get("content")),"reasoning:",repr(str(message.get("reasoning_content",""))[:100]))'
