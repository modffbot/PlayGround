#!/usr/bin/env bash
# MODYX AI - project launcher.
# - Writes $OPENCODE_WEB_DIR/deployment-output.json {project, directory}
# - Keeps source + built output inside PROJECT_DIR (/dist)
# - Installs deps, builds static dist, serves backend+frontend on PORT (default 3000) in foreground.
set -euo pipefail
/usr/bin/time -p bash -c 'echo launch'
cd "$(dirname "$0")"
PROJECT_ROOT="$(pwd)"
PORT="${PORT:-3000}"
export PORT
WEB_DIR="${OPENCODE_WEB_DIR:-/home/runner/work/_temp/omgithub-web}"
export PROJECT_ROOT WEB_DIR
/usr/bin/time -p mkdir -p "$WEB_DIR" "$PROJECT_ROOT/dist" "$PROJECT_ROOT/modyx-ai/data/uploads"
/usr/bin/time -p cp -f "$PROJECT_ROOT/modyx-ai/frontend/index.html" "$PROJECT_ROOT/modyx-ai/frontend/styles.css" "$PROJECT_ROOT/modyx-ai/frontend/app.js" "$PROJECT_ROOT/modyx-ai/frontend/pro.js" "$PROJECT_ROOT/modyx-ai/frontend/manifest.json" "$PROJECT_ROOT/modyx-ai/frontend/sw.js" "$PROJECT_ROOT/dist/"
/usr/bin/time -p mkdir -p "$PROJECT_ROOT/dist/assets"
/usr/bin/time -p cp -f "$PROJECT_ROOT/modyx-ai/frontend/assets/logo.png" "$PROJECT_ROOT/modyx-ai/frontend/assets/icon-192.png" "$PROJECT_ROOT/modyx-ai/frontend/assets/icon-512.png" "$PROJECT_ROOT/modyx-ai/frontend/assets/maskable-512.png" "$PROJECT_ROOT/dist/assets/" 2>/dev/null || echo "logo assets not yet provided - see modyx-ai/frontend/assets/README.txt"
/usr/bin/time -p test -f "$PROJECT_ROOT/dist/index.html"
/usr/bin/time -p node -e "const fs=require('fs');const f=process.env.WEB_DIR+'/deployment-output.json';fs.writeFileSync(f,JSON.stringify({project:process.env.PROJECT_ROOT,directory:process.env.PROJECT_ROOT+'/dist'}));console.log(fs.readFileSync(f,'utf8'))"
/usr/bin/time -p node -e "const o=require(process.env.WEB_DIR+'/deployment-output.json');if(o.project!==process.env.PROJECT_ROOT||!/index\.html$/.test(require('fs').readdirSync(o.directory).join())){};require('fs').accessSync(o.directory+'/index.html')"
if [[ -d "$PROJECT_ROOT/modyx-ai/node_modules/express" ]]; then
  echo "deps present, skipping npm install"
elif [[ -f "$PROJECT_ROOT/modyx-ai/package-lock.json" ]]; then
  /usr/bin/time -p npm ci --prefix "$PROJECT_ROOT/modyx-ai" --no-audit --no-fund || /usr/bin/time -p npm install --prefix "$PROJECT_ROOT/modyx-ai" --no-audit --no-fund
else
  /usr/bin/time -p npm install --prefix "$PROJECT_ROOT/modyx-ai" --no-audit --no-fund
fi
/usr/bin/time -p node --check "$PROJECT_ROOT/modyx-ai/backend/server.js"
/usr/bin/time -p node "$PROJECT_ROOT/modyx-ai/backend/server.js"
