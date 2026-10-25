"""Loopback-only static export server for browser checks; no per-request pipe output."""
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path


class QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self, format, *args):
        pass


root = Path(__file__).resolve().parents[1] / 'out'
if not root.is_dir():
    raise SystemExit('Build the frontend export first.')
ThreadingHTTPServer(('127.0.0.1', 3100), partial(QuietHandler, directory=str(root))).serve_forever()
