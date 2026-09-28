#!/data/data/com.termux/files/usr/bin/bash
set -euo pipefail
export HOME=/data/data/com.termux/files/home
export PREFIX=/data/data/com.termux/files/usr
export PATH="$PREFIX/bin:/system/bin"
cd "$HOME/models"
file=DeepSeek-R1-Distill-Llama-8B-Q4_K_M.gguf
url='https://hf-mirror.com/bartowski/DeepSeek-R1-Distill-Llama-8B-GGUF/resolve/main/DeepSeek-R1-Distill-Llama-8B-Q4_K_M.gguf?download=true'
aria2c --continue=true --max-connection-per-server=16 --split=16 --min-split-size=1M \
  --file-allocation=none --max-tries=0 --retry-wait=5 --timeout=60 \
  --dir="$HOME/models" --out="$file" "$url"
if [ "$(wc -c < "$file")" -ne 4920736608 ]; then
  echo 'DeepSeek model file has the wrong size.' >&2
  exit 1
fi
printf '%s  %s\n' '87bcba20b4846d8dadf753d3ff48f9285d131fc95e3e0e7e934d4f20bc896f5d' "$file" | sha256sum -c -
rm -f -- "$HOME/models/Qwen3-4B-Q4_K_M.gguf" "$HOME/models/deepseek-r1-8b.gguf"
echo 'DeepSeek-R1 Llama 8B download verified; previous local models were removed.'
