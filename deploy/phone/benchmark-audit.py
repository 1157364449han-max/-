"""Check whether the quality model catches a plausible but inconsistent solution."""

import json
import os
import threading
import time

from cloud_inference import CloudInference
from learning_engine import Cancelled, FAST_SCHEMA


PROBLEM = """已知椭圆 C：x²/a²+y²/b²=1（a>b>0）的离心率为 √2/2，且经过 P(1,√2/2)。（1）求标准方程；（2）直线 l 交椭圆于 A、B，OA⊥OB。证明 l 与定圆相切，求定圆及三角形 OAB 面积最小值。"""
CANDIDATE = {
    "parts": [
        {"index": 1, "answer": "$x^2/2+y^2=1$", "steps": ["由条件得 $a^2=2,b^2=1$。"], "status": "answered"},
        {"index": 2, "answer": "切于 $x^2+y^2=2/3$，最小面积 $2/3$。", "steps": [
            "设 $x=ty+m$，由韦达与垂直得 $m^2=2(t^2+1)/3$。",
            "原点到直线距离为 $\\sqrt{2/3}$。",
            "$(y_1-y_2)^2=8(t^2+4)/(3(t^2+2)^2)$。",
            "$S^2=2(t^2+1)(t^2+4)/(9(t^2+2)^2)$。",
            "令 $u=t^2+2$，在 $u=4$ 取得最大值，却由此称 $S_{min}=2/3$ 且称 $t=0$ 取等。",
        ], "status": "answered"},
    ]
}


def main():
    cloud = CloudInference()
    payload = {
        "model": "deepseek-v4-pro",
        "messages": [
            {"role": "system", "content": "你是解析几何答案审校员。独立复算，不信任候选结论。必须从原方程选一个简单合法参数，重新求点并直接计算目标量，不能只代入候选公式。内部完成试错，只输出纠正后的最终 JSON，不展示错误尝试。每问最多 10 个精炼步骤，每个等式与最终答案必须一致。"},
            {"role": "user", "content": "原题：\n" + PROBLEM + "\n候选解答：\n" + json.dumps(CANDIDATE, ensure_ascii=False) + "\n输出纠正后的 parts。第（2）问用 t=0 从椭圆和直线直接求 A、B 并计算面积，再核对一般式系数、最值方向和取等条件。不要输出审校过程。"},
        ],
        "format": FAST_SCHEMA,
        "options": {"num_predict": 3500, "deep_thinking": False},
    }
    started = time.monotonic()
    job = {"cancel": threading.Event(), "phase": ""}
    raw = cloud.stream(job, payload, Cancelled)
    print(json.dumps({"seconds": round(time.monotonic() - started, 1), "result": json.loads(raw)}, ensure_ascii=False))


if __name__ == "__main__":
    main()
