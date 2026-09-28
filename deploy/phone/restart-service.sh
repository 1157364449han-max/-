#!/data/data/com.termux/files/usr/bin/bash
set -euo pipefail
export HOME=/data/data/com.termux/files/home
export PREFIX=/data/data/com.termux/files/usr
export PATH="$PREFIX/bin:/system/bin"
app_dir="$HOME/dongjiexi"
pid_file="$app_dir/server.pid"
rollback_on_failure="${1:-}"
backup=""

if [ "$rollback_on_failure" = "--rollback-on-failure" ]; then
  shopt -s nullglob
  backups=("$app_dir"/private.env.backup.*)
  if [ "${#backups[@]}" -gt 0 ]; then
    backup="${backups[$((${#backups[@]} - 1))]}"
  fi
fi

stop_service() {
  if [ -f "$pid_file" ]; then
    old_pid="$(tr -cd '0-9' < "$pid_file")"
    if [ -n "$old_pid" ] && kill -0 "$old_pid" 2>/dev/null; then
      kill "$old_pid"
      for _ in 1 2 3 4 5 6 7 8 9 10; do
        kill -0 "$old_pid" 2>/dev/null || break
        sleep 1
      done
    fi
  fi
}

start_and_wait() {
  "$app_dir/launch-detached.sh"
  for _ in 1 2 3 4 5 6 7 8 9 10 11 12; do
    if "$app_dir/check-app-health.sh" >/dev/null 2>&1; then
      "$app_dir/check-app-health.sh"
      return 0
    fi
    sleep 2
  done
  return 1
}

stop_service
if start_and_wait; then
  exit 0
fi

if [ -n "$backup" ] && [ -f "$backup" ]; then
  echo '新配置未通过健康检查，正在恢复上一份私有配置……' >&2
  cp "$backup" "$app_dir/private.env"
  chmod 600 "$app_dir/private.env"
  stop_service
  if start_and_wait; then
    echo '已恢复原服务；云端配置没有启用。' >&2
    exit 1
  fi
fi

echo '服务启动后未通过健康检查，请查看 app.log。' >&2
exit 1
