#!/data/data/com.termux/files/usr/bin/bash
set -euo pipefail
export HOME=/data/data/com.termux/files/home
export PREFIX=/data/data/com.termux/files/usr
export PATH="$PREFIX/bin:/system/bin"
umask 077
setsid llama-server -m "$HOME/models/DeepSeek-R1-Distill-Llama-8B-Q4_K_M.gguf" -c 2048 --reasoning off \
  --host 127.0.0.1 --port 8082 --alias deepseek-r1-llama-8b \
  --api-key-file "$HOME/dongjiexi/model.key" > "$HOME/dongjiexi/deepseek-test.log" 2>&1 < /dev/null &
echo $! > "$HOME/dongjiexi/deepseek-test.pid"
echo 'DeepSeek test server started on loopback port 8082.'
