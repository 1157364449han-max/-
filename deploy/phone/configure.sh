#!/data/data/com.termux/files/usr/bin/bash
set -euo pipefail
export HOME=/data/data/com.termux/files/home
mkdir -p "$HOME/dongjiexi" "$HOME/models"
env_file="$HOME/dongjiexi/private.env"
if [ -e "$env_file" ]; then
  echo '已存在私密配置，不覆盖。'
  exit 0
fi
access_key="$(/data/data/com.termux/files/usr/bin/python -c 'import secrets; print(secrets.token_hex(24))')"
model_key="$(/data/data/com.termux/files/usr/bin/python -c 'import secrets; print(secrets.token_hex(24))')"
umask 077
{
  echo 'DONGJIEXI_CLOUD=1'
  echo 'DONGJIEXI_INFERENCE_PROVIDER=chat-completions'
  echo 'DONGJIEXI_ALLOW_LOOPBACK_MODEL_HTTP=1'
  echo 'DONGJIEXI_MODEL_API_BASE=http://127.0.0.1:8080/v1'
  echo "DONGJIEXI_MODEL_API_KEY=$model_key"
  echo 'DONGJIEXI_MODEL_ID=deepseek-r1-llama-8b'
  echo 'DONGJIEXI_MODEL_VISION=0'
  echo 'DONGJIEXI_MODEL_JSON_MODE=prompt-only'
  echo 'DONGJIEXI_ALLOWED_MODELS=deepseek-r1-llama-8b'
  echo "DONGJIEXI_ACCESS_KEY=$access_key"
  echo 'DONGJIEXI_ALLOWED_ORIGINS=https://dongjiexi.github.io'
  echo 'DONGJIEXI_MAX_CONCURRENT=1'
  echo 'DONGJIEXI_JOBS_PER_10_MINUTES=6'
} > "$env_file"
echo '已创建私密配置；访问口令保存在手机的 private.env 中。'
