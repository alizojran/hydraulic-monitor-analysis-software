from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path


class NoCacheHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()


if __name__ == "__main__":
    root = Path(__file__).resolve().parent
    NoCacheHandler.directory = str(root)
    server = ThreadingHTTPServer(("127.0.0.1", 18080), NoCacheHandler)
    print("HMAS local admin: http://127.0.0.1:18080/")
    server.serve_forever()
