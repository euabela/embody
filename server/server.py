#!/usr/bin/env python3
"""
emBODY web — optional data-collection server (Python 3.8+, standard library only).

Serves the static experiment and stores submissions on disk in the same
layout as the original PHP tool, so the MATLAB scripts work unchanged:

    <data>/<experiment>/subjects/<participant id>/{data.txt,presentation.txt,0.csv,...}

Usage:
    python3 server/server.py                 # http://localhost:8000
    PORT=8080 EMBODY_DATA=/srv/embody-data EMBODY_ADMIN_PASSWORD=secret python3 server/server.py

Then set  submit.endpoint = "api/submit"  in config.js.

With EMBODY_ADMIN_PASSWORD set, GET /api/export (HTTP basic auth, any user name)
downloads everything collected as a ZIP. Put the server behind HTTPS
(e.g. a reverse proxy such as Caddy or nginx) when collecting real data.
"""
import base64
import hmac
import io
import json
import os
import re
import sys
import zipfile
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = Path(os.environ.get("EMBODY_DATA", ROOT / "data")).resolve()
PASSWORD = os.environ.get("EMBODY_ADMIN_PASSWORD", "")
MAX_BODY = 20 * 1024 * 1024
NAME_OK = re.compile(r"^[\w.-]{1,100}$")
FILE_OK = re.compile(r"^(\d{1,4}\.csv|data\.txt|presentation\.txt|techdata\.txt|session\.json)$")
HIDDEN = {"data", "server", ".git", ".github"}  # never served as static files


def safe_experiment(name):
    name = re.sub(r"[^\w.-]+", "_", str(name or "default")).strip("._") or "default"
    return name[:100]


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=str(ROOT), **kw)

    def end_headers(self):
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Referrer-Policy", "no-referrer")
        super().end_headers()

    def _json(self, code, obj):
        body = json.dumps(obj).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def do_POST(self):
        if self.path.split("?")[0].rstrip("/") != "/api/submit":
            return self._json(404, {"ok": False, "error": "not found"})
        try:
            n = int(self.headers.get("Content-Length", "0"))
            if n <= 0 or n > MAX_BODY:
                return self._json(413, {"ok": False, "error": "bad size"})
            msg = json.loads(self.rfile.read(n).decode("utf-8"))
            subject, token, files = str(msg.get("subject", "")), str(msg.get("token", "")), msg.get("files")
            if not NAME_OK.match(subject) or not re.match(r"^[0-9a-f]{16,64}$", token) or not isinstance(files, dict):
                return self._json(400, {"ok": False, "error": "bad request"})
            folder = DATA / safe_experiment(msg.get("experiment")) / "subjects" / subject
            folder.mkdir(parents=True, exist_ok=True)
            tok_file = folder / ".token"
            # The first browser to write a participant folder owns it
            if tok_file.exists():
                if not hmac.compare_digest(tok_file.read_text().strip(), token):
                    return self._json(409, {"ok": False, "error": "participant id already in use"})
            else:
                tok_file.write_text(token)
            for name, content in files.items():
                if not FILE_OK.match(name) or not isinstance(content, str):
                    return self._json(400, {"ok": False, "error": "bad file " + str(name)[:40]})
            for name, content in files.items():
                tmp = folder / (name + ".tmp")
                tmp.write_text(content, encoding="utf-8")
                tmp.replace(folder / name)
            return self._json(200, {"ok": True, "saved": sorted(files)})
        except (ValueError, json.JSONDecodeError):
            return self._json(400, {"ok": False, "error": "invalid json"})
        except OSError as e:
            self.log_error("write failed: %s", e)
            return self._json(500, {"ok": False, "error": "write failed"})

    def translate_path(self, path):
        full = Path(super().translate_path(path)).resolve()
        try:
            rel = full.relative_to(ROOT)
        except ValueError:
            return str(ROOT / "__missing__")
        blocked = rel.parts and (rel.parts[0] in HIDDEN or any(p.startswith(".") for p in rel.parts))
        if blocked or full == DATA or DATA in full.parents:
            return str(ROOT / "__missing__")
        return str(full)

    def do_GET(self):
        if self.path.split("?")[0] == "/api/export":
            return self.export()
        return super().do_GET()

    def export(self):
        if not PASSWORD:
            return self._json(403, {"ok": False, "error": "set EMBODY_ADMIN_PASSWORD to enable export"})
        auth = self.headers.get("Authorization", "")
        ok = False
        if auth.startswith("Basic "):
            try:
                pw = base64.b64decode(auth[6:]).decode().split(":", 1)[1]
                ok = hmac.compare_digest(pw, PASSWORD)
            except Exception:
                ok = False
        if not ok:
            self.send_response(401)
            self.send_header("WWW-Authenticate", 'Basic realm="emBODY export"')
            self.end_headers()
            return
        buf = io.BytesIO()
        with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
            if DATA.exists():
                for f in sorted(DATA.rglob("*")):
                    if f.is_file() and f.name != ".token" and not f.name.endswith(".tmp"):
                        z.write(f, f.relative_to(DATA).as_posix())
        body = buf.getvalue()
        self.send_response(200)
        self.send_header("Content-Type", "application/zip")
        self.send_header("Content-Disposition", 'attachment; filename="embody_data.zip"')
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)


def main():
    port = int(os.environ.get("PORT", sys.argv[1] if len(sys.argv) > 1 else 8000))
    host = os.environ.get("HOST", "0.0.0.0")
    DATA.mkdir(parents=True, exist_ok=True)
    print(f"emBODY serving {ROOT} on http://{host}:{port}  (data -> {DATA})", flush=True)
    ThreadingHTTPServer((host, port), Handler).serve_forever()


if __name__ == "__main__":
    main()
