<!-- .github/pull_request_template.md -->

## Tasks

<!-- Task IDs from Claude/Tasks.md, e.g. T-506, T-507. A PR without a task ID needs a task first. -->

- T-

## Summary

<!-- What changed and why. Link the phase in Claude/Plan.md. -->

## Financial impact

<!-- "None" or: which money flows (WALLET_LEDGER.md §6), which invariants (INV-xx),
     which idempotency keys, and what serialises the path under concurrency. -->

- [ ] None — this PR does not touch money, the ledger, matching or settlement
- [ ] Yes — described above, and `pnpm reconcile` passes

## Security impact

<!-- "None" or: threat IDs from Security.md §3 affected or mitigated, new attack surface,
     new authorization decisions, new external input. -->

- [ ] None
- [ ] Yes — described above

## Tests

<!-- Test IDs added or changed: FIN-xx, CC-xx, PROP-xx, DR-xx, plus new unit/integration tests. -->

## Metrics run

<!-- Metrics.md IDs and their measured values, e.g. MET-COV-03 = 96.2%, MET-FIN-01 = 0. -->

## Documentation

<!-- Which documents were updated, or an explicit reason why none was needed (RULE-L03). -->

## Definition of Done (task level)

- [ ] Acceptance criteria of every listed task are met
- [ ] `pnpm typecheck` clean
- [ ] `pnpm lint && pnpm format:check` clean, zero warnings
- [ ] All declared tests exist and pass; a new test fails without this change
- [ ] Coverage thresholds still met
- [ ] No float money; no `UPDATE`/`DELETE` against ledger tables
- [ ] Every new route has an explicit authorization policy
- [ ] Every new mutating use case emits an audit event
- [ ] No secret, credential or real endpoint added
- [ ] `Tasks.md` and `Progress.md` updated

## Notes for the reviewer

<!-- Anything non-obvious: trade-offs, rejected alternatives, follow-up tasks created. -->

---

<!-- Labels: add `financial` if this touches domain/, betting, settlement, wallet or migrations;
     add `e2e` to run the Playwright suite; `emergency` only per DevelopmentWorkflow.md §7. -->
