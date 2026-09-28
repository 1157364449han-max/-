#!/data/data/com.termux/files/usr/bin/bash
set -euo pipefail
export HOME=/data/data/com.termux/files/home
export PREFIX=/data/data/com.termux/files/usr
export PATH="$PREFIX/bin:/system/bin"
mkdir -p "$HOME/models"
cd "$HOME/models"
file=DeepSeek-R1-Distill-Llama-8B-Q4_K_M.gguf
url='https://hf-mirror.com/bartowski/DeepSeek-R1-Distill-Llama-8B-GGUF/resolve/main/DeepSeek-R1-Distill-Llama-8B-Q4_K_M.gguf?download=true'
while [ ! -f "$file" ] || [ "$(wc -c < "$file")" -lt 4920736608 ]; do
  curl --fail --location --retry 5 --retry-all-errors --retry-delay 3 --continue-at - --output "$file" "$url" || sleep 5
done
if [ "$(wc -c < "$file")" -ne 4920736608 ]; then
  echo 'DeepSeek 模型文件大小不正确。' >&2
  exit 1
fi
printf '%s  %s\n' '87bcba20b4846d8dadf753d3ff48f9285d131fc95e3e0e7e934d4f20bc896f5d' "$file" | sha256sum -c -
rm -f -- "$HOME/models/Qwen3-4B-Q4_K_M.gguf" "$HOME/models/deepseek-r1-8b.gguf"
echo 'DeepSeek-R1 Llama 8B 模型下载校验完成；旧本机模型已自动删除。'
