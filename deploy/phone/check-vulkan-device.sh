#!/data/data/com.termux/files/usr/bin/bash
set -euo pipefail
export HOME=/data/data/com.termux/files/home
export PREFIX=/data/data/com.termux/files/usr
export PATH="$PREFIX/bin:/system/bin"
vulkaninfo --summary 2>&1 | grep -E 'deviceName|deviceType|driverName|apiVersion|ERROR|error' | head -n 20
