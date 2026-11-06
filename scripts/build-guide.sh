#!/bin/sh
# Renders content/guide/essay-mistakes.html to the PDF the site hands out.
# Needs Google Chrome installed. Run from the repo root: pnpm guide
set -e
CHROME="${CHROME:-/Applications/Google Chrome.app/Contents/MacOS/Google Chrome}"
SRC="$(pwd)/content/guide/essay-mistakes.html"
OUT="$(pwd)/public/guides/7-essay-mistakes.pdf"
mkdir -p "$(dirname "$OUT")"
"$CHROME" --headless=new --disable-gpu --no-pdf-header-footer --virtual-time-budget=10000 --print-to-pdf="$OUT" "file://$SRC" >/dev/null 2>&1
echo "Wrote $OUT"
