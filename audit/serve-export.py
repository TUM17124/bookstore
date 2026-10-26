"""Loopback-only static export server for browser checks; no per-request pipe output."""
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path


class QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self, format, *args):
        pass

    def translate_path(self, path):
        resolved = Path(super().translate_path(path))
        # Next's segment-prefetch request flattens the final exported directory.
        # Serve only a corresponding real file beneath the export root.
        name = resolved.name
        if not resolved.exists() and name.startswith('__next.') and name.endswith('.txt'):
            prefix, separator, suffix = name.rpartition('.')
            if separator and suffix == 'txt' and '.' in prefix:
                directory, _, segment = prefix.rpartition('.')
                candidate = resolved.parent / directory / (segment + '.txt')
                if candidate.is_file() and root in candidate.resolve().parents:
                    return str(candidate)
        return str(resolved)


class PreviewServer(ThreadingHTTPServer):
    # Browser hydration fetches many chunks concurrently. The default backlog
    # of five can refuse connections on Windows during a full visual suite.
    request_queue_size = 128
    daemon_threads = True


root = Path(__file__).resolve().parents[1] / 'out'
if not root.is_dir():
    raise SystemExit('Build the frontend export first.')
PreviewServer(('127.0.0.1', 3100), partial(QuietHandler, directory=str(root))).serve_forever()
