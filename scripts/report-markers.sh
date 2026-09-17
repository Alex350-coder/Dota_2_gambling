#!/usr/bin/env bash
# Uncertainty-marker report (CLAUDE.md §6, MET-DOC-03).
# Reports informational counts of LEGAL VALIDATION REQUIRED / EXTERNAL VALIDATION REQUIRED /
# POST-MVP across Claude/**, and fails if any DECISION REQUIRED marker exists inside src/** —
# that marker means "the project owner must choose", so it must never ship in product code.
set -euo pipefail

count_marker() {
  { grep -rlE "$1" --include='*.md' "$2" 2>/dev/null || true; } | wc -l | tr -d ' '
}

LEGAL_DOCS=$(count_marker "LEGAL VALIDATION REQUIRED" Claude)
EXTERNAL_DOCS=$(count_marker "EXTERNAL VALIDATION REQUIRED" Claude)
POST_MVP_DOCS=$(count_marker "POST-MVP" Claude)

echo "Uncertainty marker report (informational, Claude/**):"
echo "  LEGAL VALIDATION REQUIRED:    $LEGAL_DOCS file(s)"
echo "  EXTERNAL VALIDATION REQUIRED: $EXTERNAL_DOCS file(s)"
echo "  POST-MVP:                     $POST_MVP_DOCS file(s)"

DECISION_MATCHES=$(grep -rln "DECISION REQUIRED" --include='*.ts' --include='*.tsx' src 2>/dev/null || true)

if [ -n "$DECISION_MATCHES" ]; then
  echo ""
  echo "DECISION REQUIRED marker(s) found inside src/** (MET-DOC-03, blocking):"
  echo "$DECISION_MATCHES"
  exit 1
fi

echo ""
echo "MET-DOC-03: 0 DECISION REQUIRED markers in src/**."
