#!/data/data/com.termux/files/usr/bin/bash
set -euo pipefail
export HOME=/data/data/com.termux/files/home
export PREFIX=/data/data/com.termux/files/usr
export PATH="$PREFIX/bin:/system/bin"
set -a
. "$HOME/dongjiexi/private.env"
set +a
cd "$HOME/dongjiexi"
python -c 'import cloud_inference; a=cloud_inference.CloudInference(); print("configured",a.configured(),"model",a.model); print("health",a.health()); r=a.request("/models"); print("url",r.full_url); print("response",a.opener.open(r,timeout=8).read(300).decode())'
