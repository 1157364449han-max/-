import importlib.util
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location("phone_supervisor", ROOT / "deploy/phone/service-supervisor.py")
SUPERVISOR = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = SUPERVISOR
SPEC.loader.exec_module(SUPERVISOR)


class SupervisorTests(unittest.TestCase):
    def test_public_origins_reject_private_credentials_paths_and_tokens(self):
        for value in ["http://api.example.com", "https://localhost", "https://127.0.0.1", "https://192.168.0.100",
                      "https://test.local", "https://user:secret@api.example.com", "https://api.example.com/?token=x", "https://api.example.com/api"]:
            with self.subTest(value=value), self.assertRaises(ValueError):
                SUPERVISOR.public_endpoint(value)
        self.assertEqual(SUPERVISOR.public_endpoint("https://api.example.com/"), "https://api.example.com")

    def test_latest_temporary_endpoint_and_fixed_override(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            self.assertEqual(SUPERVISOR.endpoint_for(root), "")
            (root / "tunnel.log").write_text("https://old.trycloudflare.com\nhttps://new.trycloudflare.com", encoding="utf-8")
            self.assertEqual(SUPERVISOR.endpoint_for(root), "https://new.trycloudflare.com")
            (root / "cloud-endpoint.txt").write_text("https://api.example.com", encoding="utf-8")
            self.assertEqual(SUPERVISOR.endpoint_for(root), "https://api.example.com")

    def test_three_local_failures_restart_service_not_tunnel(self):
        policy = SUPERVISOR.RecoveryPolicy()
        self.assertEqual(policy.decide(0, False, True, False, True), "wait")
        self.assertEqual(policy.decide(15, False, True, False, True), "wait")
        self.assertEqual(policy.decide(30, False, True, False, True), "repair_service")
        self.assertEqual(policy.decide(31, False, True, False, True), "wait")
        self.assertEqual(policy.decide(45, False, True, False, True), "repair_service")
        self.assertEqual(policy.decide(46, False, True, False, True), "wait")

    def test_live_but_disconnected_tunnel_is_recovered(self):
        policy = SUPERVISOR.RecoveryPolicy()
        self.assertEqual(policy.decide(0, True, True, False, True), "wait")
        self.assertEqual(policy.decide(15, True, True, False, True), "wait")
        self.assertEqual(policy.decide(30, True, True, False, True), "repair_tunnel")
        self.assertEqual(policy.decide(45, True, True, False, True), "wait")

    def test_dead_tunnel_is_started_and_repair_backoff_is_bounded(self):
        policy = SUPERVISOR.RecoveryPolicy()
        self.assertEqual(policy.decide(0, True, False, False, False), "repair_tunnel")
        self.assertEqual(policy.decide(1, True, False, False, False), "wait")
        self.assertEqual(policy.decide(30, True, False, False, False), "repair_tunnel")
        self.assertEqual(policy.tunnel_after, 90)
        for attempt in range(20):
            now = policy.tunnel_after
            policy.decide(now, True, False, False, False)
            self.assertLessEqual(policy.tunnel_after - now, 300)

    def test_endpoint_not_published_until_public_health_succeeds(self):
        policy = SUPERVISOR.RecoveryPolicy()
        self.assertEqual(policy.decide(0, True, True, False, True), "wait")
        self.assertEqual(policy.decide(15, True, True, True, True), "sync_endpoint")
        self.assertEqual(policy.decide(16, True, True, True, True), "wait")
        self.assertEqual(policy.decide(75, True, True, True, True), "sync_endpoint")
        self.assertEqual(policy.tunnel_attempts, 0)

    def test_untrusted_pid_is_not_killed(self):
        with tempfile.TemporaryDirectory() as directory, patch.object(SUPERVISOR.os, "killpg", create=True) as kill:
            root = Path(directory)
            for value in ["1", "-123", "123;rm", "not-a-pid", "99999999999", "123456"]:
                (root / "tunnel.pid").write_text(value)
                SUPERVISOR.stop_owned(root, "tunnel")
            kill.assert_not_called()

    def test_healthy_recovery_resets_restart_deadlines(self):
        policy = SUPERVISOR.RecoveryPolicy(service_after=300, tunnel_after=300)
        policy.decide(10, True, True, True, True)
        self.assertEqual(policy.service_after, 0)
        self.assertEqual(policy.tunnel_after, 0)
        self.assertEqual(policy.decide(11, True, False, False, True), "repair_tunnel")

    def test_release_contains_recovery_tools_not_private_configuration(self):
        from deploy.build_release import APP_FILES
        for name in ["service-supervisor.py", "monitor-phone-endpoint.sh", "launch-endpoint-monitor.sh", "sync-phone-endpoint.sh", "launch-tunnel.sh"]:
            self.assertIn("deploy/phone/" + name, APP_FILES)
        self.assertNotIn("deploy/phone/private.env", APP_FILES)
        self.assertNotIn("deploy/phone/tunnel.env", APP_FILES)
        self.assertNotIn("deploy/phone/cloudflared.token", APP_FILES)

    def test_fixed_tunnel_token_is_only_read_from_private_file(self):
        script = (ROOT / 'deploy/phone/launch-tunnel.sh').read_text(encoding='utf-8')
        self.assertIn('--token-file', script)
        self.assertNotIn('--token ', script)
        self.assertIn('test -s cloud-endpoint.txt && test -s cloudflared.token', script)
        self.assertIn('cloudflared.token', (ROOT / '.gitignore').read_text(encoding='utf-8'))


if __name__ == "__main__":
    unittest.main()
