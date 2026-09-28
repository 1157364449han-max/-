#!/data/data/com.termux/files/usr/bin/python
"""Safely switch the phone gateway between local DeepSeek-Llama and DeepSeek Cloud."""

from __future__ import annotations

import getpass
import json
import os
import shutil
import sys
import tempfile
import time
import urllib.error
import urllib.request
from pathlib import Path


APP_DIR = Path.home() / "dongjiexi"
ENV_PATH = APP_DIR / "private.env"
DEEPSEEK_BASE = "https://api.deepseek.com"

LOCAL_VALUES = {
    "DONGJIEXI_CLOUD": "1",
    "DONGJIEXI_INFERENCE_PROVIDER": "chat-completions",
    "DONGJIEXI_ALLOW_LOOPBACK_MODEL_HTTP": "1",
    "DONGJIEXI_MODEL_API_BASE": "http://127.0.0.1:8080/v1",
    "DONGJIEXI_MODEL_ID": "deepseek-r1-llama-8b",
    "DONGJIEXI_MODEL_VISION": "0",
    "DONGJIEXI_MODEL_JSON_MODE": "prompt-only",
    "DONGJIEXI_ALLOWED_MODELS": "deepseek-r1-llama-8b",
}


def request_json(url: str, api_key: str, *, payload: dict | None = None) -> dict:
    headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}
    data = None if payload is None else json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(url, data=data, headers=headers, method="GET" if data is None else "POST")
    try:
        with urllib.request.urlopen(req, timeout=45) as response:
            return json.load(response)
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", "replace")[:400]
        raise RuntimeError(f"DeepSeek 返回 HTTP {exc.code}：{detail}") from exc
    except (urllib.error.URLError, TimeoutError) as exc:
        raise RuntimeError(f"无法连接 DeepSeek：{exc}") from exc


def verify_deepseek(api_key: str, model: str) -> None:
    models = request_json(f"{DEEPSEEK_BASE}/models", api_key)
    model_ids = {str(item.get("id", "")) for item in models.get("data", [])}
    if model not in model_ids:
        raise RuntimeError(f"账户暂不可用模型 {model}；可用模型：{', '.join(sorted(model_ids)) or '未知'}")

    # A tiny completion checks quota/billing as well as key validity. It does not
    # solve or upload a user problem.
    result = request_json(
        f"{DEEPSEEK_BASE}/chat/completions",
        api_key,
        payload={
            "model": model,
            "messages": [{"role": "user", "content": "只回复：连接成功"}],
            "thinking": {"type": "disabled"},
            "max_tokens": 8,
            "stream": False,
        },
    )
    if not result.get("choices"):
        raise RuntimeError("模型连通测试未返回有效结果。")


def parse_env(path: Path) -> tuple[list[str], dict[str, str]]:
    if not path.exists():
        raise RuntimeError("缺少 private.env；请先运行 configure.sh。")
    lines = path.read_text(encoding="utf-8").splitlines()
    values: dict[str, str] = {}
    for line in lines:
        if line and not line.lstrip().startswith("#") and "=" in line:
            key, value = line.split("=", 1)
            values[key.strip()] = value
    return lines, values


def write_env(updates: dict[str, str]) -> Path:
    lines, _ = parse_env(ENV_PATH)
    timestamp = time.strftime("%Y%m%d-%H%M%S")
    backup = ENV_PATH.with_name(f"private.env.backup.{timestamp}")
    shutil.copy2(ENV_PATH, backup)
    os.chmod(backup, 0o600)

    remaining = dict(updates)
    output: list[str] = []
    for line in lines:
        if line and not line.lstrip().startswith("#") and "=" in line:
            key = line.split("=", 1)[0].strip()
            if key in remaining:
                output.append(f"{key}={remaining.pop(key)}")
                continue
        output.append(line)
    output.extend(f"{key}={value}" for key, value in remaining.items())

    fd, tmp_name = tempfile.mkstemp(prefix="private.env.", dir=APP_DIR)
    try:
        with os.fdopen(fd, "w", encoding="utf-8", newline="\n") as stream:
            stream.write("\n".join(output) + "\n")
            stream.flush()
            os.fsync(stream.fileno())
        os.chmod(tmp_name, 0o600)
        os.replace(tmp_name, ENV_PATH)
    finally:
        if os.path.exists(tmp_name):
            os.unlink(tmp_name)
    return backup


def configure_deepseek() -> None:
    print("密钥只会写入本机私有目录，输入时不会显示，也不会上传到 GitHub。")
    api_key = getpass.getpass("请输入 DeepSeek API Key：").strip()
    if not api_key:
        raise RuntimeError("未输入密钥，未修改配置。")
    model = input("模型 [deepseek-flash]：").strip() or "deepseek-flash"
    if model not in {"deepseek-flash", "deepseek-v4-pro"}:
        raise RuntimeError("仅允许 deepseek-flash 或 deepseek-v4-pro。")
    print("正在验证密钥、余额和模型可用性……")
    verify_deepseek(api_key, model)
    backup = write_env(
        {
            "DONGJIEXI_CLOUD": "1",
            "DONGJIEXI_INFERENCE_PROVIDER": "chat-completions",
            "DONGJIEXI_ALLOW_LOOPBACK_MODEL_HTTP": "0",
            "DONGJIEXI_MODEL_API_BASE": DEEPSEEK_BASE,
            "DONGJIEXI_MODEL_API_KEY": api_key,
            "DONGJIEXI_MODEL_ID": model,
            "DONGJIEXI_MODEL_VISION": "0",
            "DONGJIEXI_MODEL_JSON_MODE": "json_object",
            "DONGJIEXI_ALLOWED_MODELS": "deepseek-flash,deepseek-v4-pro",
        }
    )
    print(f"云端模型配置成功。旧配置已备份为 {backup.name}。")


def configure_local() -> None:
    _, current = parse_env(ENV_PATH)
    local_values = dict(LOCAL_VALUES)
    # Reuse the existing random local-model secret instead of exposing it.
    if current.get("DONGJIEXI_MODEL_API_BASE", "").startswith("http://127.0.0.1"):
        local_key = current.get("DONGJIEXI_MODEL_API_KEY", "")
    else:
        local_key = os.urandom(24).hex()
    local_values["DONGJIEXI_MODEL_API_KEY"] = local_key
    backup = write_env(local_values)
    print(f"已切回手机本机 DeepSeek-R1 Llama 8B。旧配置已备份为 {backup.name}。")


def main() -> int:
    mode = sys.argv[1] if len(sys.argv) > 1 else ""
    try:
        if mode == "deepseek":
            configure_deepseek()
        elif mode == "local":
            configure_local()
        else:
            print("用法：python configure-inference.py deepseek|local", file=sys.stderr)
            return 2
    except (RuntimeError, KeyboardInterrupt) as exc:
        print(f"配置未改变：{exc}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
