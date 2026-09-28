#!/data/data/com.termux/files/usr/bin/bash
export HOME=/data/data/com.termux/files/home
export PREFIX=/data/data/com.termux/files/usr
export PATH="$PREFIX/bin:/system/bin"
termux-wake-lock
bash "$HOME/dongjiexi/launch-endpoint-monitor.sh"
exec "$HOME/dongjiexi/start.sh" >> "$HOME/dongjiexi/app.log" 2>&1

