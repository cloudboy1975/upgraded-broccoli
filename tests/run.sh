#!/bin/bash
# Runs every test file against a locally served head-on.html and prints
# one line per file:  <file> pass=<n> fail=<n>
#
#   ./tests/run.sh              # serves the repo itself on :8778
#   HEADON_URL=... ./tests/run.sh   # or point at an already-running server
#
# Exits non-zero if any file failed, so CI can gate on it.
set -uo pipefail
cd "$(dirname "$0")"
REPO="$(cd .. && pwd)"

NODE="${NODE:-node}"
command -v "$NODE" >/dev/null 2>&1 || NODE=/opt/node22/bin/node

PORT="${PORT:-8778}"
OWN_SERVER=""
if [ -z "${HEADON_URL:-}" ]; then
  if ! curl -s -o /dev/null "http://127.0.0.1:$PORT/head-on.html"; then
    (cd "$REPO" && python3 -m http.server "$PORT" --bind 127.0.0.1 >/dev/null 2>&1) &
    OWN_SERVER=$!
    for _ in $(seq 1 20); do
      curl -s -o /dev/null "http://127.0.0.1:$PORT/head-on.html" && break
      sleep 0.25
    done
  fi
  export HEADON_URL="http://127.0.0.1:$PORT/head-on.html"
fi

status=0
for f in test-*.js; do
  out=$(timeout 300 "$NODE" "$f" 2>&1)
  pass=$(echo "$out" | grep -c '^PASS')
  fail=$(echo "$out" | grep -c '^FAIL')
  err=""
  echo "$out" | grep -q 'TEST ERROR' && err=" SCRIPT_ERROR"
  echo "$f pass=$pass fail=$fail$err"
  if [ "$fail" -gt 0 ] || [ -n "$err" ]; then
    status=1
    echo "$out" | grep -E '^FAIL|TEST ERROR' | sed 's/^/    /'
  fi
done

[ -n "$OWN_SERVER" ] && kill "$OWN_SERVER" 2>/dev/null
exit $status
