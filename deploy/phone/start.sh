#!/data/data/com.termux/files/usr/bin/bash
set -euo pipefail
export HOME=/data/data/com.termux/files/home
export PREFIX=/data/data/com.termux/files/usr
export PATH="$PREFIX/bin:/system/bin"
cd "$HOME/dongjiexi"
if [ ! -f "$HOME/dongjiexi/private.env" ]; then
  echo '缺少 private.env；先运行 configure.sh。' >&2
  exit 1
fi
set -a
. "$HOME/dongjiexi/private.env"
set +a
case "${DONGJIEXI_MODEL_ID:-qwen3-4b}" in
  qwen3-4b)
    model_file="$HOME/models/Qwen3-4B-Q4_K_M.gguf"
    model_size=2497280256
    ;;
  deepseek-r1-8b)
    model_file="$HOME/models/deepseek-r1-8b.gguf"
    model_size=5027783040
    ;;
  *) echo '不支持的模型 ID。' >&2; exit 1 ;;
esac
if [ ! -f "$model_file" ] || [ "$(wc -c < "$model_file")" -ne "$model_size" ]; then
  echo '所选模型尚未下载完成或文件大小不符。' >&2
  exit 1
fi
export DONGJIEXI_MODEL_VISION=0
umask 077
printf '%s\n' "$DONGJIEXI_MODEL_API_KEY" > "$HOME/dongjiexi/model.key"
llama-server -m "$model_file" -c 4096 --reasoning off --host 127.0.0.1 --port 8080 --alias "$DONGJIEXI_MODEL_ID" --api-key-file "$HOME/dongjiexi/model.key" > "$HOME/dongjiexi/model.log" 2>&1 &
model_pid=$!
trap 'kill "$model_pid" 2>/dev/null || true' EXIT
python server.py --host 127.0.0.1 --port 8765

