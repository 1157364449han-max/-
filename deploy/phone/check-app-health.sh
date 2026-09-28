#!/data/data/com.termux/files/usr/bin/bash
set -euo pipefail
export HOME=/data/data/com.termux/files/home
export PREFIX=/data/data/com.termux/files/usr
export PATH="$PREFIX/bin:/system/bin"
set -a
. "$HOME/dongjiexi/private.env"
set +a
python -c 'import os,json,sys,urllib.request; base=sys.argv[1]; key=os.environ["DONGJIEXI_ACCESS_KEY"]; req=urllib.request.Request(base+"/api/session",data=json.dumps({"access_key":key}).encode(),headers={"Content-Type":"application/json"}); token=json.load(urllib.request.urlopen(req,timeout=15))["token"]; req=urllib.request.Request(base+"/api/health",headers={"Authorization":"Bearer "+token}); data=json.load(urllib.request.urlopen(req,timeout=15)); print("authorized engine:",data["engine"]["available"],"models:",data["engine"]["models"])' "${1:-http://127.0.0.1:8765}"

