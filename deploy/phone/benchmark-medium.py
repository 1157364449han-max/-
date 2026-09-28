"""Run a medium analytic-geometry benchmark without printing credentials."""

import json
import os
import time
import urllib.request


BASE = os.environ.get("DONGJIEXI_BENCHMARK_BASE", "http://127.0.0.1:8765").rstrip("/")
QUESTION = """已知椭圆 C：x²/a²+y²/b²=1（a>b>0）的离心率为 √2/2，且经过点 P(1,√2/2)。
（1）求椭圆 C 的标准方程；
（2）设直线 l 与椭圆 C 交于 A、B 两点，O 为坐标原点。若 OA⊥OB，证明：直线 l 与一个定圆相切，并求该定圆的方程及三角形 OAB 面积的最小值。"""


def request(path, token=None, data=None):
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = "Bearer " + token
    payload = None if data is None else json.dumps(data, ensure_ascii=False).encode()
    req = urllib.request.Request(BASE + path, data=payload, headers=headers)
    with urllib.request.urlopen(req, timeout=15) as response:
        return json.load(response)


def main():
    started = time.monotonic()
    token = request("/api/session", data={"access_key": os.environ["DONGJIEXI_ACCESS_KEY"]})["token"]
    model = os.environ["DONGJIEXI_MODEL_ID"]
    job = request("/api/jobs", token, {"kind": "solve", "model": model, "text": QUESTION, "depth": "normal"})
    first_output = None
    last_phase = ""
    while time.monotonic() - started < 180:
        job = request("/api/jobs/" + job["id"], token)
        phase = job.get("phase", "")
        if phase != last_phase and ("字符" in phase or "输出" in phase):
            first_output = first_output or time.monotonic()
        last_phase = phase
        if job["status"] not in {"running", "cancelling"}:
            break
        time.sleep(0.5)
    else:
        request("/api/jobs/" + job["id"] + "/cancel", token, {})
        raise RuntimeError("中等题超过 180 秒，已停止任务")

    result = job.get("result") or {}
    parts = result.get("parts") or []
    print(json.dumps({
        "model": model,
        "status": job["status"],
        "first_output_seconds": None if first_output is None else round(first_output - started, 1),
        "total_seconds": round(time.monotonic() - started, 1),
        "completion": result.get("completion"),
        "verification": result.get("verification"),
        "answers": [part.get("answer") for part in parts if isinstance(part, dict)],
        "steps": [part.get("steps") for part in parts if isinstance(part, dict)],
        "scene": result.get("scene"),
        "error": job.get("error"),
    }, ensure_ascii=False))


if __name__ == "__main__":
    main()
