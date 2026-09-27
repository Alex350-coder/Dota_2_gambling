# Esports Betting Exchange — Engineering MVP (Simulated Money)

A peer-to-peer (matched) betting exchange for esports, built as a **portfolio project**. Users
bet against each other, not against the house. **All money in this project is simulated.**

[![Money mode](https://img.shields.io/badge/money%20mode-SIMULATED-success)](#simulated-money)
[![Status](https://img.shields.io/badge/status-in%20development-yellow)](#roadmap)

## What this is

- A **P2P betting exchange**: every bet is funded and paid by other bettors. The platform provides
  no capital and takes **0%**.
- **Fixed decimal odds 1.8** on both sides of a binary market. Of every matched pool, 90% returns
  to the winner and 10% of the pool (20% of the matched stake) is the **streamer's commission**.
- **Partial matching** is first-class: if you ask to stake S/100 and only S/30 finds a
  counterparty, S/70 stays unmatched and is returned to you; only the matched S/30 is at risk.
- A demonstration of **financial-grade engineering**: a double-entry append-only ledger, integer
  money, explicit state machines, transactional matching with real concurrency tests, idempotent
  settlement, and CI as a hard quality and security gate.
- **Game-agnostic** by design. Dota 2 is the initial theme and seed content; adding CS2, Valorant
  or LoL is data and theming, not a rewrite.

### The economics, concretely

Two users each stake S/100 on opposite outcomes at odds 1.8:

|                     | Amount                                |
| ------------------- | ------------------------------------- |
| Pool                | S/200                                 |
| Winner receives     | **S/180** (S/100 stake + S/80 profit) |
| Streamer commission | **S/20**                              |
| Platform profit     | **S/0**                               |

Partial match — you request S/100, S/30 is matched and you win:

|                           | Amount                          |
| ------------------------- | ------------------------------- |
| Unmatched returned        | S/70                            |
| Matched return (30 × 1.8) | S/54 (S/30 stake + S/24 profit) |
| Streamer commission       | S/6                             |
| **Your total**            | **S/124**                       |

No money is created: `winner_return + commission = 2 × matched`, always, in integer céntimos.

## What this is **not**

- ❌ **Not a licensed or authorised gambling operator.** It holds no authorisation from any
  regulator, and makes no claim to.
- ❌ **Not real money.** There are no deposits, no withdrawals, no payment processing. Balances are
  simulated credits with no cash value and cannot be redeemed.
- ❌ **Not production-ready for real money.** The architecture supports it, but activation is
  blocked behind a 22-point Production Readiness Gate (`production-readiness.json`, enforced at
  boot) that is currently 0/22 met — legal, regulatory, KYC/AML, payments, security and
  operational.
- ❌ **Not affiliated with Valve, Riot, Blizzard or any game publisher.** No proprietary assets or
  marks are used.
- ❌ **Not gambling advice**, and not a place to gamble.

## Screenshots

| Home                                    | Market (live book + bet form)               | How it works                                            |
| --------------------------------------- | ------------------------------------------- | ------------------------------------------------------- |
| ![Home page](docs/screenshots/home.jpg) | ![Market page](docs/screenshots/market.jpg) | ![How it works page](docs/screenshots/how-it-works.jpg) |

Captured from a local build running against a demo-seeded database (`pnpm demo`).

## Quick start

```bash
# Requirements: Node 22, pnpm, Docker (for PostgreSQL 16)
pnpm install
cp .env.example .env          # placeholders only — never commit a real secret
docker compose up -d db
pnpm db:migrate
pnpm demo                     # seeds a browsable market with a partially matched book
pnpm dev                      # http://localhost:3000
```

Verification:

```bash
pnpm verify        # lint, format, typecheck, unit, integration, build
pnpm verify:full   # + concurrency, security, invariants, E2E, coverage gates
pnpm reconcile     # recompute all balances from the ledger and assert INV-01..15
```

## Architecture at a glance

A **modular monolith** with ports & adapters, enforced by dependency-cruiser: the domain layer
imports nothing external, and every external concern (database, payments, results, clock) sits
behind a port.

```
Next.js 15 (App Router, RSC)  →  Application use cases  →  Domain (pure)
                                        ↓ ports
                          PostgreSQL 16 · Drizzle + raw SQL for locking
```

```mermaid
flowchart LR
    UI["src/app/** — Next.js routes & UI"] --> APP["src/application/** — use cases"]
    APP --> DOM["src/domain/** — pure, framework-free"]
    APP --> PORTS["src/domain/ports/** — interfaces"]
    PORTS -.implemented by.-> INFRA["src/infra/** — Postgres/Drizzle, crypto, mail"]
    INFRA --> PG[(PostgreSQL 16)]
```

| Concern    | Approach                                                                                                         |
| ---------- | ---------------------------------------------------------------------------------------------------------------- |
| Money      | `bigint` minor units end-to-end; strings on the wire; floats banned by a lint rule                               |
| Balances   | Double-entry, append-only ledger; wallets are a projection, reconciled on demand                                 |
| Matching   | FIFO time priority at a fixed price, inside a per-market advisory lock                                           |
| Settlement | Idempotent runs keyed per allocation; at most one `COMPLETED` run per market, enforced by a partial unique index |
| Results    | A `MatchResultProvider` port with a 4-eyes manual adapter and a dispute path                                     |
| Payments   | A `PaymentProvider` port; only `SimulatedPaymentProvider` is constructible today                                 |

## Security

Least privilege, secure defaults, defence in depth, fail closed. Highlights: Argon2id + opaque
server-side sessions, explicit per-route authorization, step-up auth for admin and financial
actions, strict nonce-based CSP, PostgreSQL-backed rate limiting, append-only audit trail, and a
database role that physically cannot `UPDATE` or `DELETE` ledger rows.

CI is a hard gate: lint, typecheck, unit, integration, database, concurrency and invariant tests,
CodeQL, secret scanning, dependency review. Merging with a failing required check is prohibited.

Vulnerability reporting: [`SECURITY.md`](SECURITY.md).

## Testing

| Layer                  | Tooling                                                   |
| ---------------------- | --------------------------------------------------------- |
| Unit / property        | Vitest + fast-check                                       |
| Integration & database | Vitest against a real PostgreSQL instance                 |
| Concurrency            | Parallel transactions, ≥50 iterations per scenario        |
| Mutation               | Stryker, on the financial core (`pnpm test:mutation`)     |
| Disaster recovery      | Real dump/restore drills against Postgres (`tests/dr/**`) |
| E2E                    | Playwright (+ axe accessibility checks)                   |

32 scenarios are mandatory and enumerated: 21 financial (FIN-01..21), 4 property/invariant
(PROP-01..04) and 7 concurrency (CC-01..07). A missing scenario fails CI (`pnpm test:manifest`).

## Simulated money

`MONEY_MODE=SIMULATED` is the default and the only supported value. Simulated credits are minted
from a dedicated `SIMULATION_FAUCET` ledger account so that even simulated funds are fully
accounted for and reconcilable — the same code paths, the same invariants, no shortcut. Every
simulated balance is labelled `SIMULATED` in the UI. Setting `MONEY_MODE=REAL` makes the
application refuse to boot unless a local `production-readiness.json` records every one of 22
production-readiness gates as satisfied (`src/platform/config/production-readiness.ts`) — it does
not, by design, and that file is intentionally excluded from version control (see `.gitignore`).

## Responsible gambling

Even in simulation the platform implements 18+ enforcement, deposit/stake/loss/session limits
(lowering takes effect immediately, raising after a cooling-off period), self-exclusion that
cannot be reversed before its term, honest activity summaries computed from the ledger, and risk
messaging.

## Roadmap

| Phase | Focus                                                                                   |
| ----- | --------------------------------------------------------------------------------------- |
| P0–P2 | Tooling and CI gates · domain core · ledger and schema                                  |
| P3–P4 | Identity, sessions, authorization · game-agnostic catalog                               |
| P5–P6 | Betting and matching engine · results and settlement                                    |
| P7–P9 | Public experience · account area and responsible gambling · admin, audit, observability |
| P10   | Hardening, disaster-recovery drills, performance, portfolio polish                      |

Post-MVP (architecturally unblocked, deliberately not built): additional market types, parlays,
automated result providers, real payment adapters, multi-currency.

## Real-money readiness

Real money is a **compliance** problem before it is a technical one. Activation requires a legal
opinion, regulatory authorisation, payment-provider approval, KYC, AML and fraud controls, age
verification beyond self-declaration, responsible-gambling obligations, financial reconciliation,
an independent security review, infrastructure hardening, monitoring, backup and recovery
validation, auditability, and an explicit written owner approval — 22 gates in total, all
currently unmet. Technical capability is not authorisation, and no flag alone flips it.

## Legal disclaimer

This repository is provided for educational and portfolio purposes. It is **not** a gambling
service, offers no real-money wagering, and creates no offer or invitation to gamble. Legal and
policy pages in this project are **technical drafts and have not been reviewed by qualified
counsel**; they must not be relied upon. Gambling legislation differs by jurisdiction and
operating a real-money service typically requires authorisation. Nothing here is legal advice.

## Licence

**Decision pending** — no licence has been chosen yet. Until a `LICENSE` file exists, default
copyright applies and no permission to reuse is granted.

## Portfolio purpose

This project exists to demonstrate how a system that handles money should be engineered: explicit
invariants over implicit trust, an auditable ledger over mutable balances, deterministic
concurrency over hopeful locking, tests that assert exact amounts, and honesty about what has not
been validated. The betting domain was chosen because it punishes every one of those shortcuts.
