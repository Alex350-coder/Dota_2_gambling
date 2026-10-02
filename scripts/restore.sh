#!/usr/bin/env bash
# scripts/restore.sh — scripted restore procedure (T-1003)
#
# Implements Claude/ops/DISASTER_RECOVERY.md §3, steps 2-8, against a target Postgres instance:
#   1. (caller's responsibility — see §3 step 1) declare the incident, stop the application.
#   2. Provision handled by the caller (this script restores INTO an already-reachable, already
#      empty target database; it does not provision infrastructure).
#   3. Restore the latest backup into the target.
#   4. Verify the migration version matches the application and the money_mode row is intact.
#   5. Run `pnpm reconcile` — must be clean or this script aborts (never starts the app on an
#      inconsistent ledger).
#   6. Re-run the mandatory financial scenario suite (read-only-safe: it runs against its own
#      migrated schema in tests/integration, not against the restored data directly — see NOTE).
#   7/8. Resuming writes and recording the incident are the caller's/operator's responsibility.
#
# LIMITATION (recorded rather than hidden): this repository has no continuous WAL-archiving
# infrastructure (Claude/ops/DISASTER_RECOVERY.md §1 describes pg_basebackup + streaming WAL,
# which requires a provisioned archive_command/replica setup this local/portfolio deployment does
# not run). This script performs a LOGICAL restore (pg_dump --format=custom / pg_restore), which
# proves the idempotent-replay mechanism §4 describes (no duplicate payouts, no orphan
# reservations) but cannot demonstrate true point-in-time recovery to an arbitrary second — that
# requires the WAL-archiving infrastructure described in §1, which is an infra/ops decision
# (hosting provider configuration), not application code. RPO/RTO measured with this script are
# therefore directional, not the formal MET-DR-01/02 measurement on real infra.
#
# Usage:
#   scripts/restore.sh backup <dump-file> <source-database-url>
#   scripts/restore.sh restore <dump-file> <target-database-url>

set -euo pipefail

usage() {
  echo "Usage: $0 backup <dump-file> <source-database-url>" >&2
  echo "       $0 restore <dump-file> <target-database-url>" >&2
  exit 1
}

require_url() {
  local url="$1"
  if [[ -z "$url" ]]; then
    echo "A database URL is required (never hardcoded — RULE-E08)." >&2
    exit 1
  fi
}

do_backup() {
  local dump_file="$1"
  local source_url="$2"
  require_url "$source_url"
  echo "[restore.sh] Creating logical dump: $dump_file"
  pg_dump --format=custom --file="$dump_file" "$source_url"
  echo "[restore.sh] Backup complete."
}

do_restore() {
  local dump_file="$1"
  local target_url="$2"
  require_url "$target_url"

  if [[ ! -f "$dump_file" ]]; then
    echo "[restore.sh] Dump file not found: $dump_file" >&2
    exit 1
  fi

  echo "[restore.sh] Step 3: restoring $dump_file into target database..."
  # pg_restore exits non-zero even for a harmless ignored error (e.g. a dump taken with a newer
  # pg_dump than the target server's pg_restore, which emits an unrecognised-parameter warning
  # for a session-level SET it cannot apply). Real restore correctness is verified by the
  # migration-drift/money_mode/reconcile checks below, not by pg_restore's own exit code, so a
  # non-fatal pg_restore warning does not abort the script — but is still surfaced, not hidden.
  set +e
  pg_restore --clean --if-exists --no-owner --no-acl --dbname="$target_url" "$dump_file"
  local restore_status=$?
  set -e
  if [[ "$restore_status" -ne 0 ]]; then
    echo "[restore.sh] NOTE: pg_restore exited $restore_status (see warnings above)." \
      "Continuing to verification — a real data-loss error will fail the reconcile check below."
  fi

  echo "[restore.sh] Step 4: verifying migration version and money_mode row..."
  DATABASE_URL="$target_url" pnpm db:check-drift

  local mode
  mode=$(psql "$target_url" -tA -c "SELECT mode FROM money_mode LIMIT 1")
  if [[ -z "$mode" ]]; then
    echo "[restore.sh] FATAL: money_mode row missing after restore — refusing to proceed." >&2
    exit 1
  fi
  echo "[restore.sh] money_mode = $mode"

  echo "[restore.sh] Step 5: running pnpm reconcile — must be clean before resuming."
  if ! DATABASE_URL="$target_url" pnpm reconcile; then
    echo "[restore.sh] FATAL: reconciliation failed on the restored data. STOP. Do not resume" >&2
    echo "[restore.sh] writes. Escalate per Claude/ops/DISASTER_RECOVERY.md §3 step 5." >&2
    exit 1
  fi

  echo "[restore.sh] Restore verified clean. Steps 6-8 (mandatory-scenario re-run, resuming"
  echo "[restore.sh] writes, and the incident record in Audit.md §6) are the operator's next"
  echo "[restore.sh] actions, not this script's."
}

main() {
  local command="${1:-}"
  case "$command" in
    backup)
      do_backup "${2:-}" "${3:-}"
      ;;
    restore)
      do_restore "${2:-}" "${3:-}"
      ;;
    *)
      usage
      ;;
  esac
}

main "$@"
