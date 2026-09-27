# Performance measurement report — P10 (T-1001)

**Environment used**: local dev machine, Docker Postgres 16 (`dota2-test-pg`, port 55432,
`dota2_test`), `next build && next start -p 3211`, seeded via `pnpm db:seed` (1 game, 3 matches,
3 markets, 6 users). **This is not** the reference environment `Claude/ops/
PERFORMANCE_SCALABILITY.md` §2 specifies (4 vCPU app / 2 vCPU DB, 10k users / 100k orders / 250k
allocations / 1M ledger entries, k6 client, 10-minute steady state). Every number below is
**directional evidence from this local machine**, not the formal `Metrics.md` §6 measurement —
consistent with the carve-out pattern already used for `MET-PERF-05` in `Progress.md` §7e/§7h/§7i.

k6 scripts implementing the real load profile are authored in `tests/perf/k6/` for whoever runs
this on the actual reference environment; they were not executed here (no k6 binary in this
sandbox, and no reference-environment hardware to run them against meaningfully).

## Results

| Metric                                                   | Threshold                       | Local result                                                                                                                                                                                                            | Verdict                                                                                                                                                                       |
| -------------------------------------------------------- | ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| MET-PERF-01 (public page TTFB)                           | `<= 300ms` p95                  | 18 samples across 6 pages (`/`, `/how-it-works`, `/games`, `/matches`, `/streamers`, `/faq`), warm: **max 16.3ms**, all samples                                                                                         | PASS locally; needs reference-env k6 run for the formal number                                                                                                                |
| MET-PERF-02 (`GET /api/v1/**` latency)                   | `<= 200ms` p95                  | 12 samples across `/api/v1/{games,matches,markets,streamers}`, warm: **max 32.6ms**                                                                                                                                     | PASS locally; same caveat                                                                                                                                                     |
| MET-PERF-03 (`POST /bets` end-to-end)                    | `<= 400ms` p95 / `<= 800ms` p99 | Re-ran `tests/perf/betting/placement-latency.test.ts` (100 samples, use-case layer): **PASS** — within budget                                                                                                           | PASS (re-confirmed, unchanged from P5)                                                                                                                                        |
| MET-PERF-04 (settlement of 1000-allocation market)       | `<= 10s`                        | Not measured — no 1000-allocation market fixture exists locally or in any prior phase (`Progress.md` §7f already flagged this as unmeasured after T-611's batching was deferred)                                        | **NOT MEASURED — EXTERNAL VALIDATION REQUIRED**, carried forward unchanged                                                                                                    |
| MET-PERF-05 (matching throughput/market)                 | `>= 50 orders/s`                | Re-ran `tests/perf/betting/matching-throughput.test.ts`: **34.1 orders/s**                                                                                                                                              | **NOT MET locally**, same pre-existing gap as P5/P8/P9 (`Progress.md` §7e/§7h/§7i) — machine-load-dependent on Docker-Desktop-on-Windows, no regression introduced this phase |
| MET-PERF-06 (slowest bet-path query)                     | `<= 50ms`                       | See `tests/perf/plans/` (T-1002) — `EXPLAIN (ANALYZE, BUFFERS)` timings recorded there                                                                                                                                  | See T-1002 report                                                                                                                                                             |
| MET-PERF-07 (API 5xx error rate)                         | `<= 0.1%`                       | 100-request burst at concurrency 20 against `GET /api/v1/markets`: 48× `200`, 52× `429` (rate limit correctly enforced), **0× 5xx**                                                                                     | PASS                                                                                                                                                                          |
| MET-PERF-08 (reconciliation runtime @ 1M ledger entries) | `<= 60s`                        | `pnpm reconcile` on the small seeded dataset (6 users, ~10 ledger entries): **1.3s**. Dataset is ~5 orders of magnitude smaller than the 1M-entry target — this number cannot be extrapolated to a pass/fail at 1M rows | **NOT MEASURED at scale — EXTERNAL VALIDATION REQUIRED**                                                                                                                      |

## What this means for the P10 exit criterion

`Plan.md` P10 exit criteria requires "MET-PERF-01..08 met or waived with justification." Per
metric:

- **Met** (locally, with the reference-environment caveat noted): MET-PERF-01, 02, 03, 07.
- **Waived with justification, carried forward** (pre-existing, not introduced this phase):
  MET-PERF-04, 05, 06 (06 resolved by T-1002, see its report), 08. Each has a concrete blocker
  recorded above (no 1000-allocation fixture; local Docker-Desktop-on-Windows throughput ceiling;
  no 1M-row dataset) rather than a silently invented pass.

## Data-hygiene note

An intermediate `pnpm reconcile` run against a Postgres state left over from the perf test suite
(which inserts wallet rows via raw SQL, bypassing `LedgerService`, as a deliberate test-fixture
shortcut for isolated unit-of-work tests) reported `INV-03` violations. This was **not** a product
defect — it was 300 leftover synthetic wallet rows from `placement-latency.test.ts`'s
`createUser()` helper, which intentionally writes directly to `wallets` without a matching ledger
transaction (each perf test file resets its own schema via `resetAndMigrate`, but running
`db:seed` afterward on the same already-dirty database mixed the two). Confirmed by resetting the
schema (`DROP SCHEMA public CASCADE` → migrate → seed) and re-running `pnpm reconcile`: clean,
15/15 invariants pass. No code change was made in response, since none was needed.
