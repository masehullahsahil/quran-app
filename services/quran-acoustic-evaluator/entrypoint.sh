#!/bin/bash
set -euo pipefail

if [[ -z "${QURAN_EVALUATOR_API_KEY:-}" ]]; then
  echo "QURAN_EVALUATOR_API_KEY is required" >&2
  exit 64
fi

python_pid=""
node_pid=""

shutdown() {
  [[ -n "$python_pid" ]] && kill -TERM "$python_pid" 2>/dev/null || true
  [[ -n "$node_pid" ]] && kill -TERM "$node_pid" 2>/dev/null || true
  [[ -n "$python_pid" ]] && wait "$python_pid" 2>/dev/null || true
  [[ -n "$node_pid" ]] && wait "$node_pid" 2>/dev/null || true
}
trap shutdown INT TERM

uvicorn app:app --app-dir /app/python --host 127.0.0.1 --port 4318 &
python_pid="$!"
node /app/quran-acoustic-evaluator.cjs &
node_pid="$!"

set +e
wait -n "$python_pid" "$node_pid"
status="$?"
set -e
shutdown
exit "$status"
