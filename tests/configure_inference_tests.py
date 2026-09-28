import importlib.util
import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch


SCRIPT = Path(__file__).parents[1] / "deploy" / "phone" / "configure-inference.py"
SPEC = importlib.util.spec_from_file_location("configure_inference", SCRIPT)
configure_inference = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(configure_inference)


class ConfigureInferenceTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.app_dir = Path(self.temp.name)
        self.env_path = self.app_dir / "private.env"
        self.env_path.write_text(
            "DONGJIEXI_ACCESS_KEY=keep-this-private\n"
            "DONGJIEXI_MODEL_API_BASE=http://127.0.0.1:8080/v1\n"
            "DONGJIEXI_MODEL_API_KEY=local-secret\n"
            "DONGJIEXI_MODEL_ID=qwen3-4b\n",
            encoding="utf-8",
        )
        self.constants = patch.multiple(
            configure_inference, APP_DIR=self.app_dir, ENV_PATH=self.env_path
        )
        self.constants.start()
        self.addCleanup(self.constants.stop)

    def test_atomic_update_preserves_access_key_and_creates_backup(self):
        backup = configure_inference.write_env(
            {
                "DONGJIEXI_MODEL_API_BASE": "https://api.deepseek.com",
                "DONGJIEXI_MODEL_API_KEY": "cloud-secret",
                "DONGJIEXI_MODEL_ID": "deepseek-flash",
            }
        )
        updated = self.env_path.read_text(encoding="utf-8")
        self.assertIn("DONGJIEXI_ACCESS_KEY=keep-this-private", updated)
        self.assertIn("DONGJIEXI_MODEL_API_KEY=cloud-secret", updated)
        self.assertTrue(backup.exists())
        self.assertIn("DONGJIEXI_MODEL_API_KEY=local-secret", backup.read_text(encoding="utf-8"))

    def test_deepseek_verification_checks_model_and_completion(self):
        with patch.object(
            configure_inference,
            "request_json",
            side_effect=[{"data": [{"id": "deepseek-flash"}]}, {"choices": [{}]}],
        ) as request:
            configure_inference.verify_deepseek("secret", "deepseek-flash")
        self.assertEqual(request.call_count, 2)
        self.assertEqual(request.call_args_list[1].kwargs["payload"]["thinking"], {"type": "disabled"})

    def test_invalid_model_does_not_rewrite_config(self):
        before = self.env_path.read_bytes()
        with patch("builtins.input", return_value="unknown-model"), patch(
            "getpass.getpass", return_value="secret"
        ):
            with self.assertRaises(RuntimeError):
                configure_inference.configure_deepseek()
        self.assertEqual(self.env_path.read_bytes(), before)
        self.assertEqual(list(self.app_dir.glob("private.env.backup.*")), [])


if __name__ == "__main__":
    unittest.main()
