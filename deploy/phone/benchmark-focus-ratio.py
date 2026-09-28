"""Regression benchmark for the 2026 focus-chord geometry problem."""

import json
import os
import time
import urllib.request


BASE = "http://127.0.0.1:8765"
QUESTION = r"""18.（17分）已知椭圆 C: \frac{x^2}{a^2}+\frac{y^2}{b^2}=1（a>b>0）的左焦点为 F(-1,0)，离心率为 \frac12。
（1）求 C 的方程；
（2）设 O 为坐标原点，过 F 且斜率大于 0 的动直线 l 与 C 交于 P、Q 两点，其中 Q 在第三象限，直线 PO 与 C 的另一个交点为 R。
（i）若三角形 PQR 的面积是三角形 PFO 的面积的 3 倍，求 l 的方程；
（ii）求 \tan\angle PQR 的最小值。"""


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
    result = job.get("result") or {}
    print(json.dumps({
        "model": model,
        "status": job.get("status"),
        "first_output_seconds": None if first_output is None else round(first_output - started, 1),
        "total_seconds": round(time.monotonic() - started, 1),
        "completion": result.get("completion"),
        "answers": [part.get("answer") for part in result.get("parts", [])],
        "steps": [part.get("steps") for part in result.get("parts", [])],
        "scene": result.get("scene"),
        "error": job.get("error"),
    }, ensure_ascii=False))


if __name__ == "__main__":
    main()
