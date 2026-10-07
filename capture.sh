#!/usr/bin/env bash
# MODYX AI - capture: renders CAPTURE_URL in a real browser and saves
# desktop + mobile PNGs into CAPTURE_DIR. Leaves the app running.
# Exit 75 = temporary navigation/browser infrastructure failure.
# Exit 1  = script or rendering defect.
set -euo pipefail
: "${CAPTURE_URL:?Set CAPTURE_URL to the exact preview URL}"
: "${CAPTURE_DIR:?Set CAPTURE_DIR to the evidence directory}"
SESSION="modyx-cap-$$"
export CAPTURE_URL CAPTURE_DIR SESSION
/usr/bin/time -p mkdir -p "$CAPTURE_DIR"
/usr/bin/time -p playwright-cli --version
cleanup() { /usr/bin/time -p playwright-cli -s="$SESSION" close >/dev/null 2>&1 || true; }
trap cleanup EXIT
if ! /usr/bin/time -p playwright-cli -s="$SESSION" open "$CAPTURE_URL"; then
  echo "capture: browser open/navigation failed (temporary)" >&2
  exit 75
fi
READY=""
for _ in $(/usr/bin/time -p seq 1 30); do
  TEXT="$(/usr/bin/time -p playwright-cli -s="$SESSION" eval --raw "() => (document.body ? document.body.innerText.length : 0)" 2>/dev/null || echo 0)"
  if [[ "$TEXT" =~ ^[0-9]+$ ]] && [[ "$TEXT" -gt 100 ]]; then READY=1; break; fi
  /usr/bin/time -p sleep 1
done
if [[ -z "$READY" ]]; then echo "capture: page did not render content (temporary)" >&2; exit 75; fi
/usr/bin/time -p playwright-cli -s="$SESSION" eval "() => { window.scrollTo(0, 0); return document.fonts ? document.fonts.status : 'na'; }"
/usr/bin/time -p sleep 2
if ! /usr/bin/time -p playwright-cli -s="$SESSION" resize 1440 900; then echo "capture: resize failed (temporary)" >&2; exit 75; fi
/usr/bin/time -p sleep 1
if ! /usr/bin/time -p playwright-cli -s="$SESSION" screenshot --filename "$CAPTURE_DIR/final-desktop.png"; then echo "capture: desktop screenshot failed (temporary)" >&2; exit 75; fi
if ! /usr/bin/time -p playwright-cli -s="$SESSION" resize 390 844; then echo "capture: resize failed (temporary)" >&2; exit 75; fi
/usr/bin/time -p sleep 1
if ! /usr/bin/time -p playwright-cli -s="$SESSION" screenshot --filename "$CAPTURE_DIR/final-mobile.png"; then echo "capture: mobile screenshot failed (temporary)" >&2; exit 75; fi
/usr/bin/time -p node -e "
const fs=require('fs');
for (const n of ['final-desktop.png','final-mobile.png']) {
  const p=process.env.CAPTURE_DIR+'/'+n;
  const b=fs.readFileSync(p);
  if (b.length<24||b.subarray(0,8).toString('hex')!=='89504e470d0a1a0a') { console.error('capture: invalid PNG: '+n); process.exit(1); }
  console.log(n+': '+b.length+' bytes');
}"
trap - EXIT
cleanup
echo "capture: done -> $CAPTURE_DIR"
