#!/usr/bin/env python3
"""
Minimal GitHub Pages simulator for local testing.

Mimics GitHub Pages behaviour:
  - Serves static files from <docroot>/lua_playground/
  - Tries  path → path/index.html → path.html
  - Falls back to 404.html (like GitHub Pages custom 404)

Usage:
    # 1. Build:
    GITHUB_ACTIONS=true npm run build
    bash scripts/create-spa-redirect.sh out /lua_playground

    # 2. Start server:
    python3 scripts/local-ghpages.py

    # 3. Open:
    http://localhost:4000/lua_playground/
    http://localhost:4000/lua_playground/test
    http://localhost:4000/lua_playground/hathi
"""

import http.server
import os
import sys
from urllib.parse import unquote

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 4000
# The server root simulates /<repo-name>/ by nesting out/ under lua_playground/
PROJECT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_DIR = os.path.join(PROJECT_DIR, "out")
# We create a virtual structure: /lua_playground/* → out/*
BASE = "/lua_playground"


class GHPagesHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        # We don't actually use the directory arg; we override translate_path
        super().__init__(*args, **kwargs)

    def translate_path(self, path: str) -> str:
        """Map URL path to filesystem, stripping the base prefix."""
        # Remove query string / fragment
        path = path.split("?")[0].split("#")[0]
        # Decode percent-encoded characters (e.g. %5B → [, %5D → ])
        path = unquote(path)

        if path.startswith(BASE):
            path = path[len(BASE):]
        if not path.startswith("/"):
            path = "/" + path

        return OUT_DIR + path

    def do_GET(self):
        fs_path = self.translate_path(self.path)

        # 1. Exact file match
        if os.path.isfile(fs_path):
            return super().do_GET()

        # 2. Directory with index.html
        idx = os.path.join(fs_path.rstrip("/"), "index.html")
        if os.path.isfile(idx):
            # GitHub Pages 301-redirects to add trailing slash
            url_path = self.path.split("?")[0]
            if not url_path.endswith("/"):
                self.send_response(301)
                self.send_header("Location", url_path + "/")
                self.end_headers()
                return
            return super().do_GET()

        # 3. Try .html extension (GitHub Pages clean URLs)
        html_path = fs_path.rstrip("/") + ".html"
        if os.path.isfile(html_path):
            # Serve the .html file at the original URL
            self.path = self.path.rstrip("/") + ".html"
            return super().do_GET()

        # 4. Fallback: serve 404.html (like GitHub Pages)
        fallback = os.path.join(OUT_DIR, "404.html")
        if os.path.isfile(fallback):
            self.send_response(404)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            with open(fallback, "rb") as f:
                content = f.read()
            self.send_header("Content-Length", str(len(content)))
            self.end_headers()
            self.wfile.write(content)
            return

        self.send_error(404, "File not found")


if __name__ == "__main__":
    server = http.server.HTTPServer(("0.0.0.0", PORT), GHPagesHandler)
    print(f"GitHub Pages simulator running at http://localhost:{PORT}{BASE}/")
    print(f"Serving files from: {OUT_DIR}")
    print(f"Press Ctrl+C to stop.\n")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopped.")
