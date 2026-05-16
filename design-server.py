#!/usr/bin/env python3
"""
Simple HTTP server to host the design system.
Serves the design directory with proper MIME types for JSX/CSS.
"""

from http.server import HTTPServer, SimpleHTTPRequestHandler
import os
import sys

class DesignSystemHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        # Serve from the frontend/src directory so relative paths work
        super().__init__(*args, directory=os.path.join(
            os.path.dirname(__file__),
            'packages/frontend/src'
        ), **kwargs)

    def end_headers(self):
        # Add CORS headers for local development
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, OPTIONS')
        self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate')
        super().end_headers()

    def guess_type(self, path):
        # Ensure JSX is served with correct MIME type
        mimetype = super().guess_type(path)
        if path.endswith('.jsx'):
            return ('application/javascript', None)
        if path.endswith('.css'):
            return ('text/css', None)
        return mimetype

def run_server(port=8000):
    address = ('localhost', port)
    httpd = HTTPServer(address, DesignSystemHandler)
    print(f"🎨 Design System Server")
    print(f"📍 http://localhost:{port}/design/index.html")
    print(f"📁 Serving: packages/frontend/src/")
    print(f"\n✨ Press Ctrl+C to stop\n")

    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\n✓ Server stopped")
        sys.exit(0)

if __name__ == '__main__':
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
    run_server(port)
