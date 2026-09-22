import hashlib
import json
from pathlib import Path
import shutil
import sys
import tempfile
import unittest
import zipfile

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from deploy.build_release import build_release, checked_version, public_https


class ReleaseBuildTests(unittest.TestCase):
    def test_builds_independent_web_and_allowlisted_desktop_package(self):
        with tempfile.TemporaryDirectory(prefix='dongjiexi-build-') as directory:
            base = Path(directory)
            source = base / 'source'
            shutil.copytree(ROOT / 'dist', source / 'dist')
            shutil.copyfile(ROOT / 'version.json', source / 'version.json')
            # Dummy data: intentionally never part of a public archive.
            (source / 'cloud.env').write_text('PRIVATE_PLACEHOLDER=do-not-package', encoding='utf-8')
            output = base / 'release'
            report = build_release(source, output, site_base='https://example.com/dongjiexi')
            config = (output / 'site/runtime-config.js').read_text(encoding='utf-8')
            self.assertIn('"deployment": "web"', config)
            self.assertIn('"apiEnabled": false', config)
            self.assertNotIn('localhost', config)
            archive = output / 'site/downloads' / ('dongjiexi-v' + report['version'] + '.zip')
            with zipfile.ZipFile(archive) as package:
                self.assertNotIn('董解析/cloud.env', package.namelist())
                version = json.loads(package.read('董解析/version.json'))
                self.assertEqual(version['update_channel'], 'https://example.com/dongjiexi/update-manifest.json')
            manifest = json.loads((output / 'site/update-manifest.json').read_text(encoding='utf-8'))
            self.assertEqual(manifest['sha256'], hashlib.sha256(archive.read_bytes()).hexdigest())
            self.assertTrue((output / ('dongjiexi-web-v' + report['version'] + '.zip')).is_file())

    def test_rejects_private_insecure_and_credential_urls(self):
        for address in ['http://example.com', 'https://localhost', 'https://127.0.0.1', 'https://10.0.0.1',
                        'https://192.168.1.2', 'https://school.local', 'https://user:password@example.com',
                        'https://example.com/?token=placeholder']:
            with self.subTest(address=address), self.assertRaises(ValueError):
                public_https(address)
        self.assertEqual(public_https('https://api.example.com/v1/'), 'https://api.example.com/v1')

    def test_refuses_to_overwrite_existing_output(self):
        with tempfile.TemporaryDirectory(prefix='dongjiexi-build-') as directory:
            output = Path(directory)
            sentinel = output / 'keep.txt'
            sentinel.write_text('keep', encoding='utf-8')
            with self.assertRaises(ValueError):
                build_release(ROOT, output)
            self.assertEqual(sentinel.read_text(encoding='utf-8'), 'keep')

    def test_version_gate_and_unsafe_static_files(self):
        with tempfile.TemporaryDirectory(prefix='dongjiexi-build-') as directory:
            source = Path(directory) / 'source'
            shutil.copytree(ROOT / 'dist', source / 'dist')
            shutil.copyfile(ROOT / 'version.json', source / 'version.json')
            (source / 'version.json').write_text('{"version":"0.0.1"}', encoding='utf-8')
            with self.assertRaises(ValueError):
                checked_version(source)
            shutil.copyfile(ROOT / 'version.json', source / 'version.json')
            (source / 'dist/private.env').write_text('placeholder', encoding='utf-8')
            with self.assertRaises(ValueError):
                build_release(source, Path(directory) / 'release')


if __name__ == '__main__':
    unittest.main()
