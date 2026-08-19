#!/usr/bin/env python3
"""Serveur de développement sans cache.

`python3 -m http.server` laisse le navigateur garder ses modules ES en mémoire :
on modifie un fichier, on recharge, et c'est l'ancien code qui tourne — piège
coûteux quand on itère avec un navigateur piloté.

Usage : python3 tools/serve-dev.py [port]
"""
import sys
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer


class NoCache(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store, must-revalidate")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()

    def log_message(self, *args):
        pass


port = int(sys.argv[1]) if len(sys.argv) > 1 else 8765
print(f"http://localhost:{port}/ (sans cache)")
ThreadingHTTPServer(("", port), NoCache).serve_forever()
