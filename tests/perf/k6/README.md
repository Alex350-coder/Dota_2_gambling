# k6 performance suites (T-1001)

These scripts implement the load profile documented in `Claude/ops/PERFORMANCE_SCALABILITY.md`
§2 and measure the thresholds in `Claude/Metrics.md` §6 (`MET-PERF-01..08`), against the
reference environment described there (4 vCPU app, 2 vCPU PostgreSQL, 10k users / 100k orders /
250k allocations / 1M ledger entries).

**Status: authored, not executed in this session.** No k6 binary is available in this sandbox and
no dedicated reference-environment hardware exists here — only a local Docker Postgres dev/test
container. Running these against that environment would produce numbers that are not comparable
to the reference environment `Metrics.md` specifies, so no result from running them locally would
be honest to report as the MET-PERF-01..08 measurement. See `../REPORT.md` for what _was_
actually measured this phase (a subset, using the existing Vitest-based perf harness, explicitly
labelled directional/local) and which metrics remain `EXTERNAL VALIDATION REQUIRED`.

## Running for real (on the reference environment)

```bash
k6 run tests/perf/k6/public-reads.js --env BASE_URL=https://<app-host>
k6 run tests/perf/k6/bet-placement.js --env BASE_URL=https://<app-host> --env AUTH_COOKIE=<session>
k6 run tests/perf/k6/settlement-batch.js --env BASE_URL=https://<app-host> --env ADMIN_COOKIE=<session>
```

Each script's thresholds map directly to a `Metrics.md` ID (see the `thresholds` block in each
file) so a k6 exit code of `0` is a mechanical pass/fail for that metric.

## Scripts

| File                  | Load                                                                                         | Metric(s)                                                                       |
| --------------------- | -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `public-reads.js`     | 200 concurrent virtual users browsing `/`, `/games`, `/matches`, `/markets`, `/markets/{id}` | MET-PERF-01 (page TTFB), MET-PERF-02 (`GET /api/v1/**`), MET-PERF-07 (5xx rate) |
| `bet-placement.js`    | 20 concurrent virtual users placing into 5 markets                                           | MET-PERF-03 (`POST /api/v1/bets` p95/p99), MET-PERF-07                          |
| `settlement-batch.js` | 1 single-iteration scenario against a pre-seeded 1000-allocation market                      | MET-PERF-04 (settlement duration)                                               |

MET-PERF-05 (matching throughput per market) and MET-PERF-06 (slowest bet-path query) and
MET-PERF-08 (reconciliation runtime at 1M ledger entries) are not HTTP-shaped and are instead
covered by the existing/added Vitest suites (`tests/perf/betting/matching-throughput.test.ts`,
`tests/perf/plans/**`, and a reconciliation timing note — see `../REPORT.md`).
