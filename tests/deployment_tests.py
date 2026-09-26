import http.client
import json
import os
from pathlib import Path
import socket
import subprocess
import sys
import time
import unittest


ROOT = Path(__file__).resolve().parents[1]


def free_port():
    with socket.socket() as probe:
        probe.bind(("127.0.0.1", 0))
        return probe.getsockname()[1]


class DeploymentTests(unittest.TestCase):
    def test_all_public_versions_match(self):
        desktop = json.loads((ROOT / "version.json").read_text(encoding="utf-8"))["version"]
        web = json.loads((ROOT / "dist" / "app-version.json").read_text(encoding="utf-8"))["version"]
        releases = json.loads((ROOT / "dist" / "releases.json").read_text(encoding="utf-8"))["current"]
        self.assertEqual((desktop, web, releases), ("0.33.0",) * 3)

    def test_cloud_runtime_and_exact_cors_allowlist(self):
        port = free_port()
        environment = os.environ.copy()
        environment.update(
            DONGJIEXI_CLOUD="1",
            DONGJIEXI_OLLAMA_URL="http://127.0.0.1:1",
            DONGJIEXI_ACCESS_KEY="correct-horse-battery-staple",
            DONGJIEXI_ALLOWED_MODELS="qwen3.5:4b",
            DONGJIEXI_ALLOWED_ORIGINS="https://app.example.test",
            DONGJIEXI_RULES_PER_MINUTE="1",
            PYTHONDONTWRITEBYTECODE="1",
            PYTHONUTF8="1",
        )
        process = subprocess.Popen(
            [sys.executable, "-B", str(ROOT / "server.py"), "--host", "127.0.0.1", "--port", str(port)],
            cwd=ROOT,
            env=environment,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
        )
        try:
            for _ in range(80):
                try:
                    connection = http.client.HTTPConnection("127.0.0.1", port, timeout=1)
                    connection.request("GET", "/runtime-config.js")
                    response = connection.getresponse()
                    script = response.read().decode("utf-8")
                    if response.status == 200:
                        break
                except OSError:
                    time.sleep(0.05)
            else:
                self.fail("cloud test server did not start")
            self.assertIn('"deployment": "web"', script)
            self.assertIn('"requiresAuth": true', script)
            self.assertNotIn("DONGJIEXI_OLLAMA_TOKEN", script)

            connection.request("OPTIONS", "/api/jobs", headers={"Origin": "https://app.example.test"})
            response = connection.getresponse()
            response.read()
            self.assertEqual(response.status, 204)
            self.assertEqual(response.getheader("Access-Control-Allow-Origin"), "https://app.example.test")

            body = json.dumps({"text": "x", "rules_only": True}).encode()
            connection.request("POST", "/api/solve", body=body, headers={"Origin": "https://evil.example", "Content-Type": "application/json"})
            response = connection.getresponse()
            response.read()
            self.assertEqual(response.status, 403)
            connection.close()

            def request(method, route, value, headers=None):
                current = http.client.HTTPConnection("127.0.0.1", port, timeout=2)
                payload = json.dumps(value).encode()
                current.request(method, route, body=payload, headers={"Content-Type": "application/json", **(headers or {})})
                answer = current.getresponse()
                content = json.loads(answer.read().decode("utf-8"))
                result = answer.status, dict(answer.getheaders()), content
                current.close()
                return result

            status, _, _ = request("POST", "/api/jobs", {"kind": "solve", "model": "qwen3.5:4b", "text": "题"})
            self.assertEqual(status, 401)
            status, _, _ = request("POST", "/api/session", {"access_key": "wrong"})
            self.assertEqual(status, 401)
            status, _, session = request("POST", "/api/session", {"access_key": "correct-horse-battery-staple"})
            self.assertEqual(status, 200)
            authorization = {"Authorization": "Bearer " + session["token"]}

            status, _, _ = request("POST", "/api/jobs", {"kind": "solve", "model": "not-allowed", "text": "题"}, authorization)
            self.assertEqual(status, 400)
            status, _, _ = request("POST", "/api/solve", {"text": "椭圆 x²/4+y²=1", "rules_only": True}, authorization)
            self.assertEqual(status, 200)
            status, headers, _ = request("POST", "/api/solve", {"text": "椭圆 x²/4+y²=1", "rules_only": True}, authorization)
            self.assertEqual(status, 429)
            self.assertIn("Retry-After", headers)
        finally:
            process.terminate()
            process.wait(timeout=5)


if __name__ == "__main__":
    unittest.main()
