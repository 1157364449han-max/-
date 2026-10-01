"""Updater adversarial fixtures; never run against the user's installation."""
import contextlib
import importlib.util
import io
import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest
import zipfile

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('dong_updater', ROOT / '检查更新.py')
updater = importlib.util.module_from_spec(spec)
spec.loader.exec_module(updater)


class UpdateSafetyTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(prefix='dong-update-test-')
        self.base = Path(self.tmp.name)
        self.install = self.base / 'app'
        (self.install / 'dist').mkdir(parents=True)
        (self.install / 'server.py').write_text('original', encoding='utf-8')
        (self.install / 'dist/index.html').write_text('original', encoding='utf-8')
        (self.install / 'version.json').write_text(json.dumps({'name':'董解析','version':'0.46.0','update_channel':'https://example.test/update','default_model':'preserve'}), encoding='utf-8')
        for name in ('private.env','董解析数据/draft.json','models/local.gguf'):
            target = self.install / name
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_text('keep', encoding='utf-8')
        required = ('server.py version.json dist/index.html dist/drag-board.js dist/geogebra-bridge.js '
                    'dist/construction-board.js dist/releases.json learning_engine.py dist/learning-ui.js '
                    'dist/learning-ui.css dist/vendor/katex/katex.min.js dist/vendor/katex/katex.min.css '
                    'dist/vendor/katex/contrib/auto-render.min.js 安装本地AI.ps1 dist/classroom.js dist/classroom.css '
                    'verification_engine.py tests/verification_tests.py tests/browser_contract_tests.cjs '
                    'dist/manifest.webmanifest dist/service-worker.js dist/runtime-config.js dist/runtime.js '
                    'dist/pwa.js dist/app-version.json tests/pwa_contract_tests.cjs dist/scene-contract.mjs '
                    'dist/cloud-contract.mjs dist/external-contract.mjs dist/external-ai.js dist/scene-merge.js '
                    'dist/label-layout.js dist/step-highlight.js parabola_locus.py dist/parabola-locus.js '
                    'hyperbola_iteration.py dist/hyperbola-iteration.js question_parts.py parabola_focal_data.py '
                    'dist/question-parts.js dist/parabola-focal-data.js').split()
        self.files = {name:'fixture' for name in required}
        self.files.update({'version.json':json.dumps({'name':'董解析','version':'0.47.0'}),
                           'dist/app-version.json':'{"version":"0.47.0"}',
                           'dist/releases.json':'{"current":"0.47.0"}',
                           'dist/service-worker.js':"const VERSION = '0.47.0';"})

    def tearDown(self):
        self.tmp.cleanup()

    def archive(self, files=None):
        target = self.base / 'update.zip'
        with zipfile.ZipFile(target, 'w') as package:
            for name, value in (self.files if files is None else files).items():
                package.writestr('董解析/'+name, value)
        return target

    def refuse(self, files, pattern):
        with self.assertRaisesRegex(ValueError, pattern):
            updater.install_archive(self.archive(files), self.install)
        self.assertEqual((self.install / 'server.py').read_text(encoding='utf-8'),'original')
        self.assertFalse(list(self.base.glob('app.backup-*')))

    def test_complete_package_preserves_private_data_and_settings(self):
        self.files['deploy/cloud.env.example'] = 'EXAMPLE=not-a-key'
        with contextlib.redirect_stdout(io.StringIO()):
            backup = updater.install_archive(self.archive(), self.install)
        self.assertTrue(backup.is_dir())
        cfg = json.loads((self.install/'version.json').read_text(encoding='utf-8'))
        self.assertEqual(cfg['default_model'],'preserve')
        self.assertEqual(cfg['update_channel'],'https://example.test/update')
        for name in ('private.env','董解析数据/draft.json','models/local.gguf'):
            self.assertEqual((self.install/name).read_text(encoding='utf-8'),'keep')

    def test_missing_current_module_refuses_before_changes(self):
        files = dict(self.files);del files['dist/parabola-focal-data.js']
        self.refuse(files,'必需')

    def test_mismatched_version_refuses(self):
        files = dict(self.files);files['dist/app-version.json']='{"version":"0.46.0"}'
        self.refuse(files,'版本不一致')

    def test_new_release_missing_goal_guard_or_home_marker_refuses(self):
        files=dict(self.files)
        files.update({'version.json':'{"name":"董解析","version":"0.47.1"}',
                      'dist/app-version.json':'{"version":"0.47.1"}',
                      'dist/releases.json':'{"current":"0.47.1"}',
                      'dist/service-worker.js':"const VERSION = '0.47.1';"})
        self.refuse(files,'必需')
        files['dist/goal-coverage.js']='fixture'
        self.refuse(files,'主页')

    def test_private_and_user_paths_refuse(self):
        for name in ('private.env','.env','deploy/.dev.vars','deploy/cloudflare/wrangler.local.jsonc','models/new.gguf','董解析数据/draft.json','.git/config'):
            with self.subTest(name=name):
                files = dict(self.files);files[name]='overwrite'
                self.refuse(files,'私有配置')

    def test_traversal_and_duplicate_paths_refuse(self):
        for name in ('../escape.txt','dist/INDEX.html','dist/aux.txt','C:/escape.txt'):
            with self.subTest(name=name):
                files=dict(self.files);files[name]='bad'
                self.refuse(files,'不安全|重复')

    def test_existing_internal_symlink_refuses(self):
        target=self.install/'dist/runtime.js'
        actual=self.install/'saved-runtime.js';actual.write_text('keep',encoding='utf-8')
        try:
            target.symlink_to(actual)
        except OSError:
            self.skipTest('Host does not permit creating symlinks')
        self.refuse(self.files,'符号链接|联接点')
        self.assertEqual(actual.read_text(encoding='utf-8'),'keep')

    def test_launcher_has_no_runtime_web_fallback(self):
        launcher=(ROOT/'启动智几何.bat').read_text(encoding='utf-8-sig')
        self.assertIn('where py',launcher)
        self.assertIn('goto web',launcher)
        self.assertIn('import sympy',launcher)
        self.assertIn('https://dongjiexi.github.io/-/',launcher)
        self.assertIn('if /i not "%~1"=="--local" goto web',launcher)

    @unittest.skipUnless(os.name == 'nt', 'Windows junction check')
    def test_existing_internal_junction_refuses(self):
        actual=self.install/'saved-vendor';actual.mkdir()
        target=self.install/'dist/vendor'
        result=subprocess.run(['cmd','/c','mklink','/J',str(target),str(actual)],capture_output=True)
        if result.returncode:
            self.skipTest('Host does not permit junction creation')
        self.refuse(self.files,'符号链接|联接点')
        self.assertFalse(list(actual.iterdir()))


if __name__ == '__main__':
    unittest.main()
