# EXPLAIN plans — bet, book, settlement paths (T-1002)

Per `Claude/ops/PERFORMANCE_SCALABILITY.md` §6: "`EXPLAIN (ANALYZE, BUFFERS)` output for the
bet-path queries is committed under `tests/perf/plans/` so plan regressions are visible in
diffs." Snapshots are named `<date>-<subject>.txt`; re-run and add a new dated file rather than
editing an old one when queries or indexes change, so history stays visible in `git log`.

## `2026-09-27-bet-book-settlement.txt`

Three representative queries, run against the local Docker `dota2-test-pg` container (16.14)
seeded via `pnpm db:seed` (a small demo dataset — 2 orders / 1 allocation on the target market,
not the 100k-order / 250k-allocation reference dataset in `PERFORMANCE_SCALABILITY.md` §2). The
plan **shape** (which index is used, whether a sort or bitmap scan appears) is what this file is
for — the millisecond timings on this tiny local dataset are not comparable to MET-PERF-06's
`<= 50ms` threshold, which is meant for the 100k-order reference dataset.

1. **Bet placement — resting-orders book scan** (`DrizzleBookRepository.findRestingOrders`,
   `src/infra/db/repositories/book.ts`): `Index Scan using book_idx on bet_orders` — the
   partial index on `(market_id, unmatched_minor)`/`status = 'OPEN'` documented in
   `PERFORMANCE_SCALABILITY.md` §3 is hit directly; no sequential scan. Locks rows with
   `FOR UPDATE` as the matching engine requires (RULE-B08's FIFO tie-break also holds — sorted by
   `created_at, seq`).
2. **Public book read** (`DrizzleBookRepository.findOpenOrdersByMarket`): same `book_idx` index,
   no lock (read-only path).
3. **Settlement — active-allocation sweep** (`DrizzleAllocationRepository.findActiveByMarketId`,
   `src/infra/db/repositories/allocation-repository.ts`): `Bitmap Index Scan on
idx_match_allocations_market_id` then a bitmap heap scan — indexed, no sequential scan.

**Verdict on MET-PERF-06** (`<= 50ms` for the slowest bet-path query): the plan shape is correct
(every query goes through its intended index, matching `PERFORMANCE_SCALABILITY.md` §3's claim
that book-query cost tracks live-order count, not history) — but the absolute timing cannot be
asserted against the 50ms budget on a dataset 4-5 orders of magnitude smaller than the reference
one. **NOT MEASURED AT SCALE — EXTERNAL VALIDATION REQUIRED**, same status as the other
reference-environment-scoped metrics in `tests/perf/REPORT.md`.

## How to regenerate

```bash
export DATABASE_URL=postgresql://postgres:postgres@localhost:55432/dota2_test
pnpm db:seed  # or a larger fixture, for a closer-to-reference-scale comparison
psql "$DATABASE_URL" -c "EXPLAIN (ANALYZE, BUFFERS) <query>"
```
