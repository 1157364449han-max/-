"""Measure an authorized solve on the on-device API without printing credentials."""
import json
import os
import time
import urllib.request


BASE = os.environ.get("DONGJIEXI_BENCHMARK_BASE", "http://127.0.0.1:8765").rstrip("/")
QUESTION = "已知椭圆 C：x²/4+y²=1，求离心率及焦点坐标。"


def request(path, token=None, data=None):
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = "Bearer " + token
    payload = None if data is None else json.dumps(data, ensure_ascii=False).encode()
    with urllib.request.urlopen(urllib.request.Request(BASE + path, data=payload, headers=headers), timeout=12) as response:
        return json.load(response)


def main():
    start = time.monotonic()
    token = request("/api/session", data={"access_key": os.environ["DONGJIEXI_ACCESS_KEY"]})["token"]
    model = os.environ["DONGJIEXI_MODEL_ID"]
    job = request("/api/jobs", token, {"kind": "solve", "model": model, "text": QUESTION, "depth": "normal"})
    submitted = time.monotonic()
    first_output = None
    last_phase = ""
    while time.monotonic() - start < 240:
        job = request("/api/jobs/" + job["id"], token)
        phase = job.get("phase", "")
        if phase != last_phase and ("字符" in phase or "输出" in phase):
            first_output = first_output or time.monotonic()
        last_phase = phase
        if job["status"] not in {"running", "cancelling"}:
            break
        time.sleep(.75)
    else:
        request("/api/jobs/" + job["id"] + "/cancel", token, {})
        raise RuntimeError("解题超过 240 秒，已停止任务")
    result = job.get("result") or {}
    print(json.dumps({
        "model": model, "status": job["status"],
        "submit_seconds": round(submitted - start, 1),
        "first_output_seconds": None if first_output is None else round(first_output - start, 1),
        "total_seconds": round(time.monotonic() - start, 1),
        "answered": (result.get("completion") or {}).get("answered"),
        "total_parts": (result.get("completion") or {}).get("total"),
        "verification": (result.get("verification") or {}).get("status"),
        "answers": [part.get("answer") for part in result.get("parts", []) if isinstance(part, dict)],
        "error": job.get("error"),
    }, ensure_ascii=False))


if __name__ == "__main__":
    main()
