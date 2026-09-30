"""Recover the private API and tunnel; never run model inference in health probes."""
from __future__ import annotations

import argparse
from dataclasses import dataclass
import ipaddress
import json
import os
from pathlib import Path
import re
import signal
import subprocess
import time
from urllib.parse import urlsplit
from urllib.request import build_opener, HTTPRedirectHandler


def public_endpoint(value: str) -> str:
    value = value.strip().rstrip("/")
    parts = urlsplit(value)
    host = (parts.hostname or "").lower().rstrip(".")
    if (parts.scheme != "https" or parts.username or parts.password or parts.query or parts.fragment
            or parts.path or parts.port not in (None, 443)
            or not re.fullmatch(r"[a-zA-Z0-9.-]+", host) or "." not in host
            or host.endswith((".local", ".internal", ".localhost"))):
        raise ValueError("API endpoint must be a public HTTPS origin")
    try:
        address = ipaddress.ip_address(host)
    except ValueError:
        pass
    else:
        if not address.is_global:
            raise ValueError("Private API endpoint is not allowed")
    return value


def endpoint_for(root: Path) -> str:
    fixed = root / "cloud-endpoint.txt"
    if fixed.exists():
        return public_endpoint(fixed.read_text(encoding="utf-8"))
    log = root / "tunnel.log"
    if not log.exists():
        return ""
    # Read only the bounded tail, not an ever-growing log on a mobile device.
    with log.open("rb") as stream:
        stream.seek(max(0, log.stat().st_size - 32768))
        matches = re.findall(r"https://[a-z0-9-]+\.trycloudflare\.com", stream.read().decode("utf-8", "replace"))
    return matches[-1] if matches else ""


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, request, fp, code, message, headers, new_url):
        return None


def healthy(url: str) -> bool:
    try:
        with build_opener(NoRedirect()).open(url + "/api/health", timeout=6) as response:
            payload = json.loads(response.read(16385))
            return response.status == 200 and payload.get("app") in {"董解析", "智几何"} and isinstance(payload.get("engine"), dict)
    except Exception:
        return False


@dataclass
class RecoveryPolicy:
    service_failures: int = 0
    tunnel_failures: int = 0
    service_attempts: int = 0
    tunnel_attempts: int = 0
    service_after: float = 0
    tunnel_after: float = 0
    sync_after: float = 0

    def decide(self, now: float, local_ok: bool, tunnel_alive: bool, public_ok: bool, has_endpoint: bool) -> str:
        if not local_ok:
            self.service_failures += 1
            self.tunnel_failures = 0
            if self.service_failures >= 3 and now >= self.service_after:
                self.service_attempts += 1
                self.service_after = now + min(300, 15 * 2 ** min(5, self.service_attempts - 1))
                return "repair_service"
            return "wait"
        self.service_failures = self.service_attempts = 0
        self.service_after = 0
        if public_ok:
            self.tunnel_failures = self.tunnel_attempts = 0
            self.tunnel_after = 0
            if now >= self.sync_after:
                self.sync_after = now + 60
                return "sync_endpoint"
            return "wait"
        self.tunnel_failures += 1
        # A live but disconnected tunnel also needs recovery. Single packet loss does not.
        if (not tunnel_alive or (has_endpoint and self.tunnel_failures >= 3)
                or self.tunnel_failures >= 8) and now >= self.tunnel_after:
            self.tunnel_attempts += 1
            self.tunnel_after = now + min(300, 30 * 2 ** min(4, self.tunnel_attempts - 1))
            return "repair_tunnel"
        return "wait"


def owned_pid(root: Path, kind: str) -> int | None:
    try:
        value = (root / {"service": "server.pid", "tunnel": "tunnel.pid", "monitor": "endpoint-monitor.pid"}[kind]).read_text().strip()
        if not re.fullmatch(r"[1-9]\d{2,8}", value) or int(value) <= 100:
            return None
        pid = int(value)
        proc = Path("/proc") / value
        if Path(os.readlink(proc / "cwd")).resolve() != root.resolve():
            return None
        command = (proc / "cmdline").read_bytes().decode("utf-8", "replace").split("\0")
        if kind == "monitor":
            matches = any(Path(arg).name == "service-supervisor.py" for arg in command)
        elif kind == "tunnel":
            matches = any(Path(arg).name == "cloudflared" for arg in command) and "tunnel" in command
        else:
            matches = any(Path(arg).name in {"start.sh", "server.py"} for arg in command)
        return pid if matches and os.getpgid(pid) == pid else None
    except (OSError, ValueError):
        return None


def stop_owned(root: Path, kind: str) -> None:
    pid = owned_pid(root, kind)
    if pid is not None:
        # Only our verified session group may be stopped; never trust a bare PID file.
        os.killpg(pid, signal.SIGTERM)
        time.sleep(2)


def run_helper(root: Path, filename: str) -> None:
    result = subprocess.run(["bash", str(root / filename)], cwd=root, timeout=75,
                            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    if result.returncode:
        raise RuntimeError("Helper did not complete")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", type=Path, required=True)
    parser.add_argument("--endpoint", action="store_true")
    parser.add_argument("--check-url")
    parser.add_argument("--is-running", choices=["service", "tunnel", "monitor"])
    args = parser.parse_args()
    root = args.root.resolve()
    if args.is_running:
        raise SystemExit(0 if owned_pid(root, args.is_running) is not None else 1)
    if args.check_url:
        raise SystemExit(0 if healthy(public_endpoint(args.check_url)) else 1)
    if args.endpoint:
        print(endpoint_for(root))
        return
    import fcntl
    root.mkdir(exist_ok=True)
    lock = (root / "supervisor.lock").open("a")
    try:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except BlockingIOError:
        print("Cloud supervisor is already running", flush=True)
        return
    policy = RecoveryPolicy()
    while True:
        try:
            endpoint = endpoint_for(root)
            local_ok = healthy("http://127.0.0.1:8765")
            public_ok = bool(endpoint) and local_ok and healthy(endpoint)
            action = policy.decide(time.monotonic(), local_ok, owned_pid(root, "tunnel") is not None, public_ok, bool(endpoint))
            if action == "repair_service":
                stop_owned(root, "service")
                run_helper(root, "launch-detached.sh")
            elif action == "repair_tunnel":
                stop_owned(root, "tunnel")
                run_helper(root, "launch-tunnel.sh")
            elif action == "sync_endpoint":
                run_helper(root, "sync-phone-endpoint.sh")
            if action != "wait":
                print(time.strftime("%Y-%m-%d %H:%M:%S"), action, flush=True)
        except Exception as error:
            # Never print configuration, tokens, or helper output into shared logs.
            print(time.strftime("%Y-%m-%d %H:%M:%S"), "recovery deferred:", type(error).__name__, flush=True)
        time.sleep(15)


if __name__ == "__main__":
    main()
