"""Rotate the private loopback model key without printing either value."""
from pathlib import Path
import os
import secrets

path = Path.home() / "dongjiexi" / "private.env"
lines = path.read_text(encoding="utf-8").splitlines()
replaced = False
for index, line in enumerate(lines):
    if line.startswith("DONGJIEXI_MODEL_API_KEY="):
        lines[index] = "DONGJIEXI_MODEL_API_KEY=" + secrets.token_hex(24)
        replaced = True
if not replaced:
    raise SystemExit("model key not found")
temporary = path.with_suffix(".env.new")
temporary.write_text("\n".join(lines) + "\n", encoding="utf-8")
os.chmod(temporary, 0o600)
temporary.replace(path)
print("model key rotated")
