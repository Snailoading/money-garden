# Static server for a built dist/ with an identity probe: GET /__pid returns
# this process's PID, so a suite can be sure it isn't talking to an orphan
# server left on the port by a crashed earlier run (that once faked results).
# Real 404s, unlike `vite preview`'s SPA fallback.
import http.server, os, sys, functools

root, port = sys.argv[1], int(sys.argv[2])

class H(http.server.SimpleHTTPRequestHandler):
    def do_GET(self):
        if self.path == "/__pid":
            body = str(os.getpid()).encode()
            self.send_response(200)
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        super().do_GET()
    def log_message(self, *a):
        pass

http.server.ThreadingHTTPServer(("127.0.0.1", port), functools.partial(H, directory=root)).serve_forever()
