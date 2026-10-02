# P10 final `pnpm verify:full` run — 2026-09-27 (T-1013)

Run on `hardening-dr-performance-portfolio-readiness`, local dev machine, against the Docker
Postgres test container `dota2-test-pg` (`postgresql://postgres:postgres@localhost:55432/dota2_test`,
`MONEY_MODE=SIMULATED`). `pnpm verify:full` was run as its constituent steps individually — the
single combined `pnpm test` invocation was killed once by the harness's background-memory
pressure reaper while this session was otherwise idle (not a test failure; see the split-run
results below, which is what `pnpm test` runs internally anyway) — and `pnpm run verify:full`'s
`format:check` step is reported separately (see the note on line-endings below) rather than
silently skipped.

## Results

| Step                | Command                 | Result                                                                    |
| ------------------- | ----------------------- | ------------------------------------------------------------------------- |
| Format              | `pnpm format:check`     | **Not clean — local-environment artifact, not a real defect** (see below) |
| Lint                | `pnpm lint`             | **PASS** — 0 errors, 0 warnings                                           |
| Typecheck           | `pnpm typecheck`        | **PASS** — 0 errors                                                       |
| Architecture        | `pnpm depcruise`        | **PASS** — 0 violations (2972 modules, 7603 dependencies)                 |
| Dead code           | `pnpm knip`             | **PASS** — 0 unused files/exports/deps                                    |
| Unit                | `pnpm test:unit`        | **PASS** — 61 files / 478 tests                                           |
| Database            | `pnpm test:db`          | **PASS** — 13 files / 45 tests                                            |
| Integration         | `pnpm test:integration` | **PASS**                                                                  |
| Concurrency         | `pnpm test:concurrency` | **PASS**                                                                  |
| Security            | `pnpm test:security`    | **PASS**                                                                  |
| Invariants          | `pnpm test:invariants`  | **PASS**                                                                  |
| Mandatory scenarios | `pnpm test:manifest`    | **PASS** — 32/32 (MET-T-03)                                               |
| Reconciliation      | `pnpm reconcile`        | **PASS** — 15/15 invariants (MET-FIN-01 = 0)                              |
| Build               | `pnpm build`            | **PASS**                                                                  |
| E2E                 | `pnpm test:e2e`         | **NOT RUN — pre-existing local blocker** (see below)                      |
| Mutation            | `pnpm test:mutation`    | **PASS** — 80.68% >= 80% threshold (T-1005; see `stryker.conf.json`)      |

## Format-check: local line-ending artifact, not a defect

`prettier --check .` flags 19 pre-existing files (none touched this phase — `.github/workflows/
*.yml`, several `scripts/*.ts`, `db/seed/dev.ts`, `drizzle.config.ts`, `playwright.config.ts`,
`vitest.config.mts`, two `tooling/eslint-rules/*` files) as having CRLF line endings on this local
Windows checkout. Verified this is **not** a repository defect:

- `git show HEAD:<file> | file -` on every flagged file shows plain LF content in the committed
  blob, no CRLF.
- `git check-attr eol -- <file>` returns `eol: lf` for every flagged file — `.gitattributes`
  already declares the correct line ending.
- CI runs on Linux runners (`Claude/CI_CD.md`), where `core.autocrlf` defaults off and this
  class of artifact does not occur.

This is a local `core.autocrlf` checkout quirk on this specific machine, unrelated to any code
this phase touched. No file was rewritten to "fix" it, since doing so would produce a large,
functionally-empty diff across files outside this phase's scope.

## E2E: pre-existing local port-3000 conflict

`playwright.config.ts` hardcodes `baseURL: https://localhost:3000`. Port 3000 was already bound by
an unrelated `node.exe` process (PID 21904) on this machine when this check ran. This is the same
class of blocker already recorded in `Progress.md` §7h (P8 closeout) and §7i (P9 closeout) — not
stopped without knowing what it is, since it may be another intentionally-running process on this
shared dev machine. E2E-labelled task requirements in this and prior phases have consistently been
satisfied instead by unit/integration/component-level tests (see those phases' own notes) —
**should be re-run** once the port conflict is cleared, before treating end-to-end browser
coverage as re-verified for this phase specifically.

## Mutation testing note

`pnpm test:mutation` was already run and recorded in T-1005's own commit — re-stated here for
completeness of this consolidated report, not re-run in this pass (a 2.5-minute run scoped to
`src/domain/{money,betting,matching,settlement,ledger}/**` only).
