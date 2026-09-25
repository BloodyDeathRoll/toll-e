#!/usr/bin/env bash
# Stops any dev server still running from this workspace (setup starts nothing else).
set -uo pipefail
ws="$(pwd -P)"
for pid in $(pgrep -f 'next dev' || true); do
  [[ "$(readlink -f "/proc/$pid/cwd" 2>/dev/null)" == "$ws" ]] && kill "$pid" && echo "stopped next dev ($pid)"
done
exit 0
