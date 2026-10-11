#!/usr/bin/env bash
# Screenshot capture for the running app.
# Env: CAPTURE_URL (exact URL to open), CAPTURE_DIR (output dir for
# final-desktop.png and final-mobile.png). Uses the worker Playwright runtime,
# closes its own browser, leaves the app running.
# Exit 75 = temporary navigation/browser infrastructure failure.
# Exit 1  = script or rendering defect.
set -euo pipefail
cd "$(dirname "$0")"
/usr/bin/time -p pwd
: "${CAPTURE_URL:?Set CAPTURE_URL to the exact URL to capture.}"
: "${CAPTURE_DIR:?Set CAPTURE_DIR to the screenshot output directory.}"
: "${RUNTIME_DIR:?RUNTIME_DIR must be set to the worker runtime scripts dir.}"
/usr/bin/time -p mkdir -p "$CAPTURE_DIR"
/usr/bin/time -p node "${RUNTIME_DIR}/scripts/default-capture.mjs"
/usr/bin/time -p ls -la "$CAPTURE_DIR/final-desktop.png" "$CAPTURE_DIR/final-mobile.png"
