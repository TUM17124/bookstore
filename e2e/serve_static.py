"""Loopback static-export server with room for parallel browser chunk requests."""
import argparse
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

parser = argparse.ArgumentParser()
parser.add_argument('--directory', default='out')
parser.add_argument('--port', type=int, default=4173)
args = parser.parse_args()


class BrowserServer(ThreadingHTTPServer):
    request_queue_size = 128
    daemon_threads = True


class Handler(SimpleHTTPRequestHandler):
    def log_message(self, *_args):
        pass


with BrowserServer(('127.0.0.1', args.port), partial(Handler, directory=args.directory)) as server:
    server.serve_forever()
