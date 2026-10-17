#!/usr/bin/env python3

from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.error import URLError
from urllib.request import urlopen
import json


WEB_ROOT = Path(__file__).resolve().parent.parent / "web"
METRICS_URL = "http://127.0.0.1:9464/metrics"


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(WEB_ROOT), **kwargs)

    def do_GET(self):
        if self.path == "/api/metrics":
            self.send_metrics()
            return
        if self.path == "/":
            self.path = "/index.html"
        super().do_GET()

    def send_metrics(self):
        try:
            with urlopen(METRICS_URL, timeout=1) as response:
                metrics = response.read().decode("utf-8")
        except (OSError, URLError) as error:
            self.send_json(503, {"connected": False, "error": str(error)})
            return

        counters = {}
        for line in metrics.splitlines():
            if line and not line.startswith("#"):
                name, _, value = line.partition(" ")
                if name.startswith("linewatch_server_"):
                    counters[name] = int(float(value))
        self.send_json(200, {"connected": True, "counters": counters})

    def send_json(self, status, payload):
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)


if __name__ == "__main__":
    server = ThreadingHTTPServer(("127.0.0.1", 8000), Handler)
    print("Linewatch Console: http://127.0.0.1:8000")
    print("Serving demo UI and proxying metrics from localhost:9464")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopping Linewatch Console.")
    finally:
        server.server_close()
