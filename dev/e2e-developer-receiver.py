"""Loopback webhook receiver for dev/e2e-developer-ui.mjs: appends every delivery (path, headers, raw body) as one JSON line.

    python3 -I dev/e2e-developer-receiver.py <port> <out-file>
"""
import http.server
import json
import sys

port, out = int(sys.argv[1]), sys.argv[2]


class Handler(http.server.BaseHTTPRequestHandler):
    def do_POST(self):
        size = int(self.headers.get("Content-Length", 0))
        body = self.rfile.read(size).decode("utf-8")
        with open(out, "a") as f:
            f.write(json.dumps({
                "path": self.path,
                "headers": {k.lower(): v for k, v in self.headers.items()},
                "body": body,
            }) + "\n")
        self.send_response(200)
        self.end_headers()

    def log_message(self, *args):
        pass


http.server.HTTPServer(("127.0.0.1", port), Handler).serve_forever()
