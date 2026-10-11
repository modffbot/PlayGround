#!/usr/bin/env bash
# MODYX FREE FIRE — project startup.
# Installs dependencies, builds the Next.js app when sources changed, writes the
# static deployment snapshot to ./dist (with index.html), publishes
# $OPENCODE_WEB_DIR/deployment-output.json, then serves the app in the
# foreground on $PORT (default 3000).
set -euo pipefail
cd "$(dirname "$0")"
/usr/bin/time -p pwd
PROJECT_DIR="$PWD"
PORT="${PORT:-3000}"
export PORT
WEB_DIR="${OPENCODE_WEB_DIR:?OPENCODE_WEB_DIR must be set by the launcher.}"

/usr/bin/time -p mkdir -p "$WEB_DIR"
/usr/bin/time -p node --version

# ---- runtime env (public placeholders so build/prerender never needs secrets) ----
: "${NEXT_PUBLIC_SUPABASE_URL:=https://placeholder.supabase.co}"
: "${NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:=placeholder-key}"
: "${NEXT_PUBLIC_SITE_URL:=http://localhost:$PORT}"
export NEXT_PUBLIC_SUPABASE_URL NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY NEXT_PUBLIC_SITE_URL

# ---- dependencies (worker metadata stamp lives in OPENCODE_WEB_DIR, not the repo) ----
STAMP="$WEB_DIR/modyx-deps-stamp"
if [[ ! -d node_modules || ! -f "$STAMP" || package.json -nt "$STAMP" || package-lock.json -nt "$STAMP" ]]; then
  /usr/bin/time -p npm ci --no-audit --no-fund
  /usr/bin/time -p touch "$STAMP"
else
  echo "dependencies up to date (stamp $STAMP)"
fi

# ---- build when needed ----
BUILD_ID_FILE="$PROJECT_DIR/.next/BUILD_ID"
NEEDS_BUILD=0
if [[ ! -f "$BUILD_ID_FILE" ]]; then
  NEEDS_BUILD=1
elif [[ -n "$(/usr/bin/time -p find src package.json package-lock.json next.config.js tsconfig.json tailwind.config.js postcss.config.js -newer "$BUILD_ID_FILE" -print -quit 2>/dev/null)" ]]; then
  NEEDS_BUILD=1
fi
if [[ "$NEEDS_BUILD" == 1 ]]; then
  /usr/bin/time -p npm run build
else
  echo "build up to date (.next/BUILD_ID newer than sources)"
fi

# ---- serve in background briefly so we can snapshot a real rendered homepage ----
/usr/bin/time -p ./node_modules/.bin/next start -p "$PORT" --hostname 0.0.0.0 &
SERVER_PID=$!
cleanup() { kill "$SERVER_PID" 2>/dev/null || true; }
trap cleanup EXIT

READY=0
# Warmup: the first dynamic render can take several seconds (cold render plus
# upstream auth/data calls), so allow a generous timeout once.
/usr/bin/time -p curl --fail --silent --max-time 120 "http://127.0.0.1:$PORT/" -o /dev/null || true
for ((i = 0; i < 40; i++)); do
  if curl --fail --silent --max-time 15 "http://127.0.0.1:$PORT/" >/dev/null 2>&1; then READY=1; break; fi
  if ! kill -0 "$SERVER_PID" 2>/dev/null; then echo "app server died during startup" >&2; exit 1; fi
  /usr/bin/time -p sleep 2
done
[[ "$READY" == 1 ]] || { echo "app server did not become ready on port $PORT" >&2; exit 1; }
echo "app server ready on port $PORT (pid $SERVER_PID)"

# ---- static deployment snapshot inside PROJECT_DIR ----
/usr/bin/time -p mkdir -p "$PROJECT_DIR/dist/_next"
/usr/bin/time -p curl --fail --silent --show-error --max-time 30 "http://127.0.0.1:$PORT/" -o "$PROJECT_DIR/dist/index.html"
/usr/bin/time -p rm -rf "$PROJECT_DIR/dist/_next/static"
/usr/bin/time -p cp -r "$PROJECT_DIR/.next/static" "$PROJECT_DIR/dist/_next/static"
/usr/bin/time -p node -e 'const fs=require("node:fs");fs.writeFileSync(process.env.OPENCODE_WEB_DIR+"/deployment-output.json",JSON.stringify({project:process.env.PROJECT_DIR,directory:process.env.PROJECT_DIR+"/dist"}))'
/usr/bin/time -p cat "$WEB_DIR/deployment-output.json"

# ---- foreground: the controller reuses this healthy server ----
# (EXIT trap above stops the server when this script exits)
# NOTE: `wait` is a shell builtin — do not prefix it with /usr/bin/time.
wait "$SERVER_PID"
