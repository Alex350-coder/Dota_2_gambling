import type { Clock, IdGenerator, RiskAlertRepository, RiskSignalReader } from "@/domain/ports";

/**
 * Deterministic fraud rules R-03..R-09 (T-913/T-914, compliance/FRAUD_PREVENTION.md §3).
 * Each function is a single, isolated read (via the `RiskSignalReader` port — no direct SQL or
 * infra import here, RULE-A02) + at-most-one `risk_alerts` write — never a hard block (that's
 * R-01/R-02, already inline in the betting guards, out of scope here) and never awaited on the
 * request path that triggers it (callers fire these with `void`, per FRAUD_PREVENTION.md §3:
 * "evaluated after commit, asynchronously, so they can never block or slow a legitimate bet").
 *
 * Thresholds (`N, K, X, Y` in the spec) are named constants here rather than wired to
 * `src/platform/config` — FRAUD_PREVENTION.md §3 calls for them to be "stored in a `risk_rules`
 * config, tuned with real data"; a full tunable-config table is POST-MVP-adjacent tooling this
 * phase does not add, so these are the seed defaults, each alert records the threshold that
 * fired (payload), and moving them to config later is a config-only change, not a rule rewrite.
 */

interface RuleDeps<Tx> {
  readonly riskSignals: (tx: Tx) => RiskSignalReader;
  readonly riskAlerts: (tx: Tx) => RiskAlertRepository;
  readonly ids: IdGenerator;
  readonly clock: Clock;
}

async function fireAlert<Tx>(
  tx: Tx,
  deps: RuleDeps<Tx>,
  ruleId: string,
  severity: "MEDIUM" | "HIGH" | "CRITICAL",
  entityType: string,
  entityId: string,
  payload: Record<string, unknown>,
): Promise<void> {
  await deps.riskAlerts(tx).create({
    id: deps.ids.next(),
    ruleId,
    severity,
    entityType,
    entityId,
    payload,
    createdAt: deps.clock.now(),
  });
}

const R03_DEVICE_WINDOW_MINUTES = 10;
const R03_MIN_SHARED_ACCOUNTS = 2;

/** R-03 — ≥N accounts sharing a device fingerprint/IP hash bet on opposite sides of the same
 * market within a window. Device signal comes from `audit_events.ip_hash` on `BET_PLACED`
 * (populated since P5), not a new column on `bet_orders`. */
export async function evaluateSharedDeviceOppositeSides<Tx>(
  tx: Tx,
  deps: RuleDeps<Tx>,
  orderId: string,
): Promise<void> {
  const match = await deps
    .riskSignals(tx)
    .findSharedDeviceOppositeSideMatch(orderId, R03_DEVICE_WINDOW_MINUTES);

  if (match) {
    await fireAlert(tx, deps, "R-03", "HIGH", "market", match.marketId, {
      orderId,
      otherOrderId: match.otherOrderId,
      otherUserId: match.otherUserId,
      windowMinutes: R03_DEVICE_WINDOW_MINUTES,
      minSharedAccounts: R03_MIN_SHARED_ACCOUNTS,
    });
  }
}

const R04_MIN_REPEATED_MARKETS = 3;

/** R-04 — two accounts repeatedly matching each other across ≥K markets. Net-flow-direction
 * refinement from the spec is not evaluated here — the repeated-pairing count alone is the
 * signal this seed rule fires on; a reviewer inspects direction manually from the payload's
 * market list (POST-MVP UI, FRAUD_PREVENTION.md §4). */
export async function evaluateRepeatedCrossMatchPairing<Tx>(
  tx: Tx,
  deps: RuleDeps<Tx>,
  orderId: string,
): Promise<void> {
  const pairs = await deps.riskSignals(tx).findRepeatedPairings(orderId, R04_MIN_REPEATED_MARKETS);

  for (const pair of pairs) {
    await fireAlert(tx, deps, "R-04", "HIGH", "user", pair.otherUserId, {
      orderId,
      marketCount: pair.marketCount,
      marketIds: pair.marketIds,
      threshold: R04_MIN_REPEATED_MARKETS,
    });
  }
}

const R05_MAX_ORDERS_PER_MINUTE = 5;

/** R-05 — account places > X orders per minute, sustained. */
export async function evaluateOrderRateSpike<Tx>(
  tx: Tx,
  deps: RuleDeps<Tx>,
  orderId: string,
): Promise<void> {
  const signal = await deps.riskSignals(tx).getOrderRateLastMinute(orderId);

  if (signal && signal.recentCount > R05_MAX_ORDERS_PER_MINUTE) {
    await fireAlert(tx, deps, "R-05", "MEDIUM", "user", signal.userId, {
      orderId,
      ordersLastMinute: signal.recentCount,
      threshold: R05_MAX_ORDERS_PER_MINUTE,
    });
  }
}

const R06_STAKE_SPIKE_MULTIPLE = 5;
const R06_MIN_PRIOR_ORDERS = 3;

/** R-06 — single stake > Y× the account's 30-day median. Requires at least
 * `R06_MIN_PRIOR_ORDERS` prior orders so a brand-new account's first bet doesn't trip this
 * (that pattern is R-08's job instead). */
export async function evaluateStakeSpike<Tx>(
  tx: Tx,
  deps: RuleDeps<Tx>,
  orderId: string,
): Promise<void> {
  const signal = await deps.riskSignals(tx).getStakeSpikeSignal(orderId);

  if (signal?.medianMinor == null || signal.priorCount < R06_MIN_PRIOR_ORDERS) {
    return;
  }

  const requested = BigInt(signal.requestedMinor);
  const median = BigInt(Math.round(Number(signal.medianMinor)));
  if (median > 0n && requested > median * BigInt(R06_STAKE_SPIKE_MULTIPLE)) {
    await fireAlert(tx, deps, "R-06", "MEDIUM", "user", signal.userId, {
      orderId,
      stakeMinor: signal.requestedMinor,
      medianMinor: signal.medianMinor,
      multiple: R06_STAKE_SPIKE_MULTIPLE,
    });
  }
}

const R08_NEW_ACCOUNT_WINDOW_MINUTES = 30;
const R08_BALANCE_FRACTION_BPS = 9000; // 90.00%

/** R-08 — new account bets its full balance on one market within minutes of registration. */
export async function evaluateNewAccountFullBalanceBet<Tx>(
  tx: Tx,
  deps: RuleDeps<Tx>,
  orderId: string,
): Promise<void> {
  const signal = await deps.riskSignals(tx).getNewAccountBalanceSignal(orderId);

  if (!signal || signal.accountAgeMinutes > R08_NEW_ACCOUNT_WINDOW_MINUTES) {
    return;
  }

  const requested = BigInt(signal.requestedMinor);
  const impliedPriorFunds = requested + BigInt(signal.availableMinor);
  if (impliedPriorFunds === 0n) return;

  const fractionBps = (requested * 10_000n) / impliedPriorFunds;
  if (fractionBps >= BigInt(R08_BALANCE_FRACTION_BPS)) {
    await fireAlert(tx, deps, "R-08", "MEDIUM", "user", signal.userId, {
      orderId,
      stakeMinor: signal.requestedMinor,
      preBetBalanceMinor: impliedPriorFunds.toString(),
      accountAgeMinutes: signal.accountAgeMinutes,
    });
  }
}

const R09_NEW_DEVICE_WINDOW_MINUTES = 15;

/**
 * R-09 — login from a new device/ASN followed by a stake within minutes. ASN lookup is out of
 * reach without a geo-IP provider not present in this repo (`EXTERNAL VALIDATION REQUIRED`);
 * this evaluates "new `ip_hash` for this session's user, session younger than the window" as
 * the reachable proxy signal instead.
 */
export async function evaluateNewDeviceStake<Tx>(
  tx: Tx,
  deps: RuleDeps<Tx>,
  orderId: string,
): Promise<void> {
  const signal = await deps
    .riskSignals(tx)
    .getNewDeviceSignal(orderId, R09_NEW_DEVICE_WINDOW_MINUTES);

  if (!signal || signal.priorSightings > 0) {
    return;
  }

  await fireAlert(tx, deps, "R-09", "HIGH", "user", signal.userId, {
    orderId,
    sessionId: signal.sessionId,
    sessionAgeMinutes: signal.sessionAgeMinutes,
    ipHash: signal.ipHash,
  });
}

/** Runs every placement-triggered rule (R-03..R-06, R-08, R-09) for one order. R-07 evaluates
 * at dispute time instead (see `evaluateCloseWindowDispute`) — a market's dispute outcome
 * doesn't exist yet when an order is placed. Callers invoke this with `void`, never awaited on
 * the request path (FRAUD_PREVENTION.md §3). */
export async function evaluatePlacementRiskRules<Tx>(
  tx: Tx,
  deps: RuleDeps<Tx>,
  orderId: string,
): Promise<void> {
  await evaluateSharedDeviceOppositeSides(tx, deps, orderId);
  await evaluateRepeatedCrossMatchPairing(tx, deps, orderId);
  await evaluateOrderRateSpike(tx, deps, orderId);
  await evaluateStakeSpike(tx, deps, orderId);
  await evaluateNewAccountFullBalanceBet(tx, deps, orderId);
  await evaluateNewDeviceStake(tx, deps, orderId);
}

const R07_CLOSE_WINDOW_SECONDS = 30;

/** R-07 — betting concentrated within seconds of market close, on a market that is later
 * disputed. Triggered from `DisputeResultUseCase`'s caller (route), not at placement. */
export async function evaluateCloseWindowDispute<Tx>(
  tx: Tx,
  deps: RuleDeps<Tx>,
  marketId: string,
): Promise<void> {
  const signal = await deps
    .riskSignals(tx)
    .getCloseWindowOrderCount(marketId, R07_CLOSE_WINDOW_SECONDS);

  if (signal.orderCount > 0) {
    await fireAlert(tx, deps, "R-07", "HIGH", "market", marketId, {
      closeWindowSeconds: R07_CLOSE_WINDOW_SECONDS,
      orderCount: signal.orderCount,
    });
  }
}
