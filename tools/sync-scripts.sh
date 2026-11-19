#!/usr/bin/env bash
# Copies the canonical client scripts in shared/scripts into every skill that uses them,
# so each skill folder stays self-contained when installed on its own.
# Usage: tools/sync-scripts.sh          (write)
#        tools/sync-scripts.sh --check  (exit 1 if any copy has drifted)
set -euo pipefail
cd "$(dirname "$0")/.."

targets=(skills/nexus-memory skills/nexus-capture skills/nexus-setup)
check=${1:-}
status=0
for skill in "${targets[@]}"; do
  mkdir -p "$skill/scripts"
  for src in shared/scripts/*.mjs; do
    dest="$skill/scripts/$(basename "$src")"
    if [[ "$check" == "--check" ]]; then
      if ! cmp -s "$src" "$dest"; then
        echo "drift: $dest differs from $src (run tools/sync-scripts.sh)"
        status=1
      fi
    else
      cp "$src" "$dest"
      chmod +x "$dest"
    fi
  done
done
[[ "$check" == "--check" && $status -eq 0 ]] && echo "scripts in sync"
exit $status
