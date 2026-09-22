#!/usr/bin/env python3
"""董解析：本地 ZIP / HTTPS 通道原地更新，保留独立的带时间戳备份。"""
from __future__ import annotations

import argparse
from datetime import datetime
import hashlib
import json
from pathlib import Path, PurePosixPath
import re
import shutil
import stat
import tempfile
import urllib.request
import zipfile

ROOT = Path(__file__).resolve().parent
MAX_SIZE = 200 * 1024 * 1024


def version_tuple(value):
    if not re.fullmatch(r"\d+\.\d+\.\d+", str(value)):
        raise ValueError("版本号格式必须为数字，例如 0.7.0。")
    return tuple(map(int, str(value).split(".")))


def install_archive(archive, root=ROOT):
    root = Path(root).resolve(strict=True)
    if not (root / "server.py").is_file() or not (root / "dist" / "index.html").is_file():
        raise ValueError("目标不是已安装的董解析程序目录。")
    old_config = json.loads((root / "version.json").read_text(encoding="utf-8-sig"))
    with tempfile.TemporaryDirectory(prefix="dongjiexi-update-") as temporary:
        unpack = Path(temporary) / "unpack"
        with zipfile.ZipFile(archive) as package:
            entries = package.infolist()
            if not entries or len(entries) > 10000 or sum(i.file_size for i in entries) > MAX_SIZE:
                raise ValueError("更新包为空或过大，已取消。")
            seen = set()
            for info in entries:
                name = info.filename.replace("\\", "/")
                path = PurePosixPath(name)
                parts = path.parts
                if (not parts or path.is_absolute() or ".." in parts
                        or any(":" in p or p.endswith((" ", ".")) for p in parts)
                        or any(re.fullmatch(r"(?i)(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?", p) for p in parts)
                        or stat.S_ISLNK(info.external_attr >> 16)):
                    raise ValueError("更新包包含不安全的路径或链接。")
                key = "/".join(parts).lower()
                if key in seen:
                    raise ValueError("更新包包含重复路径。")
                seen.add(key)
            package.extractall(unpack)
        source = unpack
        top = list(source.iterdir())
        if len(top) == 1 and top[0].is_dir():
            source = top[0]
        required = ("server.py", "version.json", "dist/index.html", "dist/drag-board.js", "dist/geogebra-bridge.js")
        if not all((source / name).is_file() for name in required):
            raise ValueError("更新包不完整：缺少入口、版本文件或画板模块。")
        config = json.loads((source / "version.json").read_text(encoding="utf-8-sig"))
        if config.get("name") != "董解析":
            raise ValueError("这不是董解析更新包。")
        if version_tuple(config.get("version")) >= (0, 8, 0) and not all((source / name).is_file() for name in ("dist/construction-board.js", "dist/releases.json")):
            raise ValueError("更新包缺少原生构造模块或版本记录，已取消。")
        if version_tuple(config.get("version")) >= (0, 9, 0) and not all((source / name).is_file() for name in ("learning_engine.py", "dist/learning-ui.js", "dist/learning-ui.css", "dist/vendor/katex/katex.min.js", "dist/vendor/katex/katex.min.css", "dist/vendor/katex/contrib/auto-render.min.js", "安装本地AI.ps1")):
            raise ValueError("更新包缺少 AI 学习模块、安装脚本或公式排版资源，已取消。")
        if version_tuple(config.get("version")) >= (0, 10, 0) and not all((source / name).is_file() for name in ("dist/classroom.js", "dist/classroom.css")):
            raise ValueError("更新包缺少学生学习与课堂演示模块，已取消。")
        if version_tuple(config.get("version")) >= (0, 11, 0) and not all((source / name).is_file() for name in ("verification_engine.py", "tests/verification_tests.py", "tests/browser_contract_tests.cjs")):
            raise ValueError("更新包缺少答案核验引擎或回归测试，已取消。")
        if version_tuple(config.get("version")) >= (0, 12, 0) and not all((source / name).is_file() for name in ("dist/manifest.webmanifest", "dist/service-worker.js", "dist/runtime-config.js", "dist/runtime.js", "dist/pwa.js", "dist/app-version.json", "tests/pwa_contract_tests.cjs")):
            raise ValueError("更新包缺少手机 PWA、统一版本配置或部署回归测试，已取消。")
        if version_tuple(config.get("version")) < version_tuple(old_config.get("version", "0.0.0")):
            raise ValueError("不自动安装较旧版本，请保留当前程序。")
        files = sorted(p for p in source.rglob("*") if p.is_file())
        for item in files:
            target = root / item.relative_to(source)
            if not target.resolve().is_relative_to(root):
                raise ValueError("目标目录包含指向程序外部的链接，已取消。")
            if target.is_dir() or any(p.exists() and not p.is_dir() for p in target.parents if p != root and p.is_relative_to(root)):
                raise ValueError("目标存在同名文件与目录冲突，已取消。")
        # 从不删除旧备份，也不递归移除用户目录。
        backup = root.with_name(root.name + ".backup-" + datetime.now().strftime("%Y%m%d-%H%M%S-%f"))
        shutil.copytree(root, backup, symlinks=True, ignore=shutil.ignore_patterns("*.pyc", "__pycache__"))
        try:
            for item in files:
                target = root / item.relative_to(source)
                target.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(item, target)
            if old_config.get("update_channel"):
                config["update_channel"] = old_config["update_channel"]
            if old_config.get("default_model"):
                config["default_model"] = old_config["default_model"]
            (root / "version.json").write_text(json.dumps(config, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        except OSError as exc:
            raise RuntimeError(f"更新未全部完成，请停止使用并从此完整备份恢复：{backup}。错误：{exc}") from exc
    print(f"更新完成：{config['version']}。旧版本完整备份：{backup}")
    print("请重新启动桌面“董解析”，浏览器按 Ctrl+F5 刷新。")
    return backup


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--file", type=Path, help="安装指定的可信 ZIP 更新包")
    parser.add_argument("--choose", action="store_true", help="选择本地更新包")
    args = parser.parse_args()
    if args.choose and not args.file:
        import tkinter as tk
        from tkinter import filedialog
        window = tk.Tk(); window.withdraw()
        try:
            chosen = filedialog.askopenfilename(title="董解析：选择可信的 ZIP 更新包", filetypes=[("董解析更新包", "*.zip")])
        finally:
            window.destroy()
        if not chosen:
            print("已取消，没有修改程序。"); return
        args.file = Path(chosen)
    if args.file:
        install_archive(args.file); return
    cfg = json.loads((ROOT / "version.json").read_text(encoding="utf-8-sig"))
    channel = cfg.get("update_channel", "")
    if not channel:
        print("当前版本：", cfg.get("version"))
        print("尚未配置在线更新通道。可运行“安装更新包.bat”选择可信的 ZIP 包，在原目录更新。")
        return
    if not channel.startswith("https://"):
        raise ValueError("更新通道必须使用 HTTPS。")
    with urllib.request.urlopen(channel, timeout=20) as response:
        remote = json.loads(response.read(1024 * 1024).decode("utf-8"))
    latest = remote.get("version", "")
    if version_tuple(latest) <= version_tuple(cfg.get("version", "0.0.0")):
        print("已是最新版本。"); return
    url, expected = remote.get("download", ""), remote.get("sha256", "").lower()
    if not (url.startswith("https://") and re.fullmatch(r"[0-9a-f]{64}", expected)):
        raise ValueError("更新清单缺少 HTTPS 地址或正确的 SHA-256 校验值。")
    with tempfile.TemporaryDirectory(prefix="dongjiexi-download-") as temporary:
        archive = Path(temporary) / "update.zip"
        with urllib.request.urlopen(url, timeout=30) as response, archive.open("wb") as output:
            total = 0
            while block := response.read(1024 * 1024):
                total += len(block)
                if total > MAX_SIZE:
                    raise ValueError("更新包下载大小超过上限。")
                output.write(block)
        if hashlib.sha256(archive.read_bytes()).hexdigest() != expected:
            raise ValueError("下载包的 SHA-256 校验失败，已取消。")
        install_archive(archive)


if __name__ == "__main__":
    try:
        main()
    except (OSError, ValueError, RuntimeError, zipfile.BadZipFile) as error:
        raise SystemExit(f"更新失败：{error}")
