"""MODYX SDK for Python — use MODYX API from your apps.
Docs: /api/docs  |  Get a key: app → API Platform tab

    from modyx import Modyx
    ai = Modyx(base="http://localhost:3000", key="mky_...")
    print(ai.chat("مرحبا")["reply"])
"""
import json
import urllib.request


class Modyx:
    def __init__(self, base="http://localhost:3000", key=""):
        self.base = base.rstrip("/")
        self.key = key

    def _call(self, path, body=None, method="POST"):
        req = urllib.request.Request(
            self.base + path,
            data=json.dumps(body or {}).encode(),
            headers={"Content-Type": "application/json", "x-api-key": self.key},
            method=method,
        )
        try:
            with urllib.request.urlopen(req, timeout=30) as r:
                return json.loads(r.read().decode())
        except Exception as e:
            raise RuntimeError(str(e))

    def models(self):
        return self._call("/api/v1/models", method="GET")

    def chat(self, message):
        return self._call("/api/v1/chat", {"message": message})
