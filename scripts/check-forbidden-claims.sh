#!/usr/bin/env bash
# Forbidden claims check (compliance/POLICIES.md §4, MET-COMP-02).
# Fails if any published document or page claims licensing, regulation, or
# guaranteed/risk-free returns. Scans this repo's app tree and top-level docs
# only — never itself, tests, or node_modules.
set -euo pipefail

PATTERN='licensed|licencia de mincetur|regulated by|autorizado por|supervised by|guaranteed profit|risk-free|ganancia garantizada|sin riesgo|official partner of'

MATCHES=$(grep -rniE "$PATTERN" \
  --include='*.md' \
  --include='*.tsx' \
  --include='*.ts' \
  --exclude-dir=node_modules \
  --exclude-dir=.git \
  --exclude-dir=.next \
  --exclude-dir=coverage \
  --exclude-dir=coverage-parts \
  --exclude-dir=scripts \
  --exclude-dir=tests \
  src README.md SECURITY.md 2>/dev/null || true)

if [ -n "$MATCHES" ]; then
  echo "Forbidden claim(s) found (MET-COMP-02):"
  echo "$MATCHES"
  exit 1
fi

echo "No forbidden claims found."
