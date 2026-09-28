import threading
import time
import unittest
from unittest.mock import patch

from learning_engine import LearningEngine


class ModelLifecycleTests(unittest.TestCase):
    def test_successful_pull_deletes_previous_models_afterward(self):
        engine = LearningEngine('.', lambda text: [])
        self.addCleanup(engine.close)
        model = 'hf.co/bartowski/DeepSeek-R1-Distill-Llama-8B-GGUF:Q4_K_M'
        engine.health = lambda: {'available': True, 'installed': True, 'remote': False, 'models': ['old-model:latest']}
        engine._stream = lambda job, path, payload: ''
        deleted = []

        def fake_request(path, payload=None, timeout=8, method=None):
            if path == '/api/delete':
                deleted.append((payload['model'], method))
                return {'status': 'success'}
            raise AssertionError(path)

        with patch('learning_engine.request_json', side_effect=fake_request):
            snapshot = engine.submit({'kind': 'pull', 'model': model})
            for _ in range(100):
                snapshot = engine.snapshot(snapshot['id'])
                if snapshot['status'] != 'running':
                    break
                time.sleep(.01)
        self.assertEqual(snapshot['status'], 'completed')
        self.assertEqual(deleted, [('old-model:latest', 'DELETE')])
        self.assertIn('自动删除旧模型', snapshot['result']['message'])


if __name__ == '__main__':
    unittest.main()
