"""One-shot local model format diagnostic; never prints model credentials."""
import json
import os
import threading

from cloud_inference import CloudInference
from learning_engine import FAST_SCHEMA, FAST_SYSTEM, Cancelled


model = CloudInference()
# llama.cpp accepts a JSON schema extension; hosted APIs use their documented
# json_object mode instead.
if model.base.startswith("http://127.0.0.1"):
    model.json_mode = "llama-schema"
payload = {
    "model": os.environ["DONGJIEXI_MODEL_ID"],
    "messages": [
        {"role": "system", "content": FAST_SYSTEM},
        {"role": "user", "content": "题目：已知椭圆 C：x²/4+y²=1，求离心率及焦点坐标。逐一解答编号 [0]。只返回包含 parts 数组的 JSON；每项仅含 index、answer、steps、status。给出关键计算。"},
    ],
    "format": FAST_SCHEMA,
    "options": {"num_predict": 900, "deep_thinking": False},
}
job = {"cancel": threading.Event(), "phase": ""}
raw = model.stream(job, payload, Cancelled)
print("mode", model.json_mode, "length", len(raw))
print(raw[:1400])
try:
    parsed = json.loads(raw)
    print("parsed_type", type(parsed).__name__, "keys", list(parsed) if isinstance(parsed, dict) else [])
except json.JSONDecodeError as error:
    print("parse_error", str(error)[:120])
