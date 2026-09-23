"""Build a portable static site and desktop update from one checked version.

No credentials, local data, models, or unlisted files enter the desktop archive.
An empty API base produces a standalone browser-only site, not a localhost proxy.
"""
from __future__ import annotations

import argparse
import hashlib
import ipaddress
import json
from pathlib import Path
import re
import shutil
from urllib.parse import urlsplit
import zipfile

ROOT = Path(__file__).resolve().parents[1]
STATIC_SUFFIXES = {'.html', '.js', '.mjs', '.css', '.json', '.webmanifest', '.svg', '.png', '.jpg', '.jpeg', '.ico', '.woff', '.woff2', '.ttf', '.eot', '.txt', '.md', '.map'}
APP_FILES = {
    'cloud_inference.py', 'render.yaml',
    'server.py', 'learning_engine.py', 'verification_engine.py', 'requirements.txt', 'version.json',
    'Dockerfile', 'compose.yaml', '.dockerignore', '.gitignore', 'README.md', '使用说明.md', '更新日志.md',
    '启动智几何.bat', '创建桌面快捷方式.bat', '手机访问.bat', '检查更新.py', '检查更新.bat',
    '安装更新包.bat', '安装本地AI.bat', '安装本地AI.ps1',
    'deploy/build_release.py', 'deploy/部署说明.md', 'deploy/cloud.env.example',
    'deploy/runtime-config.web.example.js', '.github/workflows/deploy-dongjiexi.yml',
}


def public_https(value: str) -> str:
    value = value.strip().rstrip('/')
    if not value:
        return ''
    parsed = urlsplit(value)
    host = (parsed.hostname or '').lower().rstrip('.')
    if parsed.scheme != 'https' or not host or parsed.username or parsed.password or parsed.query or parsed.fragment:
        raise ValueError('发布地址必须是无口令、查询参数和片段的 HTTPS 地址。')
    if host == 'localhost' or '.' not in host or host.endswith(('.localhost', '.local', '.internal')):
        raise ValueError('发布地址不能指向用户电脑或局域网。')
    try:
        address = ipaddress.ip_address(host)
    except ValueError:
        pass
    else:
        if not address.is_global:
            raise ValueError('发布地址不能使用回环、保留或局域网 IP。')
    # Also reject malformed ports before creating any artifacts.
    _ = parsed.port
    return value


def checked_version(source: Path) -> str:
    read = lambda name: json.loads((source / name).read_text(encoding='utf-8-sig'))
    version = read('version.json')['version']
    if not re.fullmatch(r'\d+\.\d+\.\d+', version):
        raise ValueError('无效版本号。')
    if read('dist/app-version.json')['version'] != version or read('dist/releases.json')['current'] != version:
        raise ValueError('桌面、网页与更新记录的版本不一致。')
    worker = (source / 'dist/service-worker.js').read_text(encoding='utf-8')
    if f"const VERSION = '{version}'" not in worker:
        raise ValueError('离线缓存版本不一致。')
    return version


def build_release(source: Path, output: Path, api_base='', site_base='', commit='') -> dict:
    source, output = source.resolve(), output.resolve()
    if output == source or output.is_relative_to(source / 'dist'):
        raise ValueError('产物不能覆盖程序或源网页目录。')
    if output.exists() and any(output.iterdir()):
        raise ValueError('输出目录非空；为保护已有文件，请使用新的输出目录。')
    api_base, site_base = public_https(api_base), public_https(site_base)
    version = checked_version(source)
    static = sorted(path for path in (source / 'dist').rglob('*') if path.is_file())
    for path in static:
        if path.is_symlink() or not path.resolve().is_relative_to(source / 'dist'):
            raise ValueError('网页目录包含指向外部的链接。')
        if path.suffix.lower() not in STATIC_SUFFIXES and path.name != 'LICENSE':
            raise ValueError('网页目录含未批准的文件：' + str(path.relative_to(source)))
    files = [source / name for name in sorted(APP_FILES) if (source / name).is_file()]
    files += sorted(path for path in (source / 'tests').rglob('*') if path.is_file() and path.suffix in {'.py', '.cjs'})
    files += static
    if any(path.is_symlink() or not path.resolve().is_relative_to(source) for path in files):
        raise ValueError('发布清单不能包含外部链接。')
    site = output / 'site'
    site.mkdir(parents=True)
    for path in static:
        target = site / path.relative_to(source / 'dist')
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(path, target)
    config = dict(version=version, deployment='web', apiBase=api_base, apiEnabled=bool(api_base), requiresAuth=bool(api_base), updateChannel='stable')
    (site / 'runtime-config.js').write_text('window.DONGJIEXI_CONFIG = Object.freeze(' + json.dumps(config, ensure_ascii=False) + ');\n', encoding='utf-8')
    (site / '.nojekyll').write_text('', encoding='utf-8')
    archive = site / 'downloads' / f'dongjiexi-v{version}.zip'
    archive.parent.mkdir()
    with zipfile.ZipFile(archive, 'w', zipfile.ZIP_DEFLATED) as package:
        for path in sorted(files):
            name = '董解析/' + path.relative_to(source).as_posix()
            if path == source / 'version.json' and site_base:
                desktop = json.loads(path.read_text(encoding='utf-8-sig'))
                desktop['update_channel'] = site_base + '/update-manifest.json'
                package.writestr(name, json.dumps(desktop, ensure_ascii=False, indent=2) + '\n')
            else:
                package.write(path, name)
    digest = hashlib.sha256(archive.read_bytes()).hexdigest()
    if site_base:
        manifest = dict(name='董解析', version=version, download=site_base + '/downloads/' + archive.name, sha256=digest, build_commit=commit)
        (site / 'update-manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    report = dict(version=version, apiEnabled=bool(api_base), site_base=site_base or None, desktop_sha256=digest,
                  desktop_files=[path.relative_to(source).as_posix() for path in sorted(files)],
                  note='发布候选产物；构建成功不代表已经上线。')
    (output / 'build-report.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    web_archive = output / f'dongjiexi-web-v{version}.zip'
    with zipfile.ZipFile(web_archive, 'w', zipfile.ZIP_DEFLATED) as package:
        for path in sorted(site.rglob('*')):
            if path.is_file():
                package.write(path, path.relative_to(site).as_posix())
    return report


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', type=Path, default=ROOT)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--api-base', default='')
    parser.add_argument('--site-base', default='')
    parser.add_argument('--commit', default='')
    args = parser.parse_args()
    result = build_release(args.source, args.output, args.api_base, args.site_base, args.commit)
    print(json.dumps({key: value for key, value in result.items() if key != 'desktop_files'}, ensure_ascii=False, indent=2))
