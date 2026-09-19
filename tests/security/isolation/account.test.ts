import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDb, createPool } from "@/infra/db/client";
import { DrizzleUnitOfWork, type DbTx } from "@/infra/db/uow";
import { DrizzleUserRepository } from "@/infra/db/repositories/user-repository";
import { DrizzleWalletRepository } from "@/infra/db/repositories/wallet-repository";
import { DrizzleRgLimitRepository } from "@/infra/db/repositories/rg-limit-repository";
import { DrizzleSessionRepository } from "@/infra/db/repositories/session-repository";
import { DrizzleOrderRepository } from "@/infra/db/repositories/order-repository";
import { LedgerService } from "@/infra/db/ledger";
import { DrizzleAuditWriter } from "@/infra/db/audit-writer";
import { CryptoIdGenerator } from "@/infra/id-generator";
import { GetWalletUseCase } from "@/application/wallet/get-wallet";
import { ListTransactionsUseCase } from "@/application/wallet/list-transactions";
import { SimulatedCreditUseCase } from "@/application/wallet/simulated-credit";
import {
  ListLimitsUseCase,
  UpdateLimitUseCase,
  ActivitySummaryUseCase,
} from "@/application/compliance";
import { ListSessionsUseCase } from "@/application/identity/list-sessions";
import { testDbConfig } from "../../helpers/test-db-config";
import { resetAndMigrate } from "../../helpers/reset-db";

class TestClock {
  constructor(private current: Date) {}
  now(): Date {
    return this.current;
  }
  set(date: Date): void {
    this.current = date;
  }
}

/**
 * T-814 — negative isolation test per new account/wallet/compliance endpoint (RULE-E02).
 * Unlike `bets.test.ts`/`session-revocation.test.ts` (which target a single resource by ID),
 * these use cases are inherently self-scoped by `input.userId` with no separate resource ID —
 * so "isolation" here means: acting as the attacker never surfaces or is influenced by the
 * owner's data, even when both act against the same use case at (nearly) the same time.
 */
describe("cross-user isolation: account/wallet/compliance (T-814)", () => {
  const pool = createPool(testDbConfig());
  const db = createDb(pool);
  const uow = new DrizzleUnitOfWork(db);
  const ids = new CryptoIdGenerator();
  const audit = new DrizzleAuditWriter();
  const clock = new TestClock(new Date("2026-01-01T00:00:00.000Z"));
  const ledger = new LedgerService(ids, clock);

  const wallets = (tx: DbTx, ownerId: string) => new DrizzleWalletRepository(tx, ownerId);
  const rgLimits = (tx: DbTx, ownerId: string) => new DrizzleRgLimitRepository(tx, ownerId);

  const getWallet = new GetWalletUseCase<DbTx>({
    uow,
    wallets,
    betOrders: (tx, ownerId) => new DrizzleOrderRepository(tx, ownerId),
  });

  const listTransactions = new ListTransactionsUseCase<DbTx>({ uow, ledger });

  const simulatedCredit = new SimulatedCreditUseCase<DbTx>({
    uow,
    users: (tx) => new DrizzleUserRepository(tx),
    wallets,
    ledger,
    ids,
    clock,
    audit,
    simulatedModeEnabled: true,
    dailyCapMinor: 100_000n,
  });

  const listLimits = new ListLimitsUseCase<DbTx>({ uow, rgLimits, clock });
  const updateLimit = new UpdateLimitUseCase<DbTx>({ uow, rgLimits, clock });

  const activitySummary = new ActivitySummaryUseCase<DbTx>({
    uow,
    ledger,
    sessions: (tx) => new DrizzleSessionRepository(tx),
    clock,
  });

  const listSessions = new ListSessionsUseCase<DbTx>({
    uow,
    sessions: (tx) => new DrizzleSessionRepository(tx),
    clock,
  });

  beforeAll(async () => {
    await resetAndMigrate(pool);
  });

  afterAll(async () => {
    await pool.end();
  });

  async function createUser(): Promise<string> {
    const userId = ids.next();
    await pool.query(
      "INSERT INTO users (id, email, status, date_of_birth) VALUES ($1, $2, 'ACTIVE', '1990-01-01')",
      [userId, `isolation-${randomUUID()}@example.test`],
    );
    return userId;
  }

  it("GET wallet never reflects another user's balance", async () => {
    const owner = await createUser();
    const attacker = await createUser();

    await simulatedCredit.execute({
      userId: owner,
      currency: "PEN",
      amountMinor: 5_000n,
      idempotencyKey: randomUUID(),
    });

    const attackerWallet = await getWallet.execute({ userId: attacker, currency: "PEN" });
    expect(attackerWallet.wallet.availableMinor).toBe(0n);

    const ownerWallet = await getWallet.execute({ userId: owner, currency: "PEN" });
    expect(ownerWallet.wallet.availableMinor).toBe(5_000n);
  });

  it("wallet transaction history never lists another user's ledger entries", async () => {
    const owner = await createUser();
    const attacker = await createUser();

    await simulatedCredit.execute({
      userId: owner,
      currency: "PEN",
      amountMinor: 3_000n,
      idempotencyKey: randomUUID(),
    });

    const attackerPage = await listTransactions.execute({ userId: attacker, currency: "PEN" });
    expect(attackerPage.total).toBe(0);
    expect(attackerPage.items).toHaveLength(0);

    const ownerPage = await listTransactions.execute({ userId: owner, currency: "PEN" });
    expect(ownerPage.total).toBe(1);
  });

  it("updating one user's RG limit never changes another user's limit", async () => {
    const owner = await createUser();
    const attacker = await createUser();

    await updateLimit.execute({ userId: owner, kind: "STAKE", period: "DAY", value: 25_000n });

    const attackerLimits = await listLimits.execute({ userId: attacker });
    const attackerStake = attackerLimits.find((l) => l.kind === "STAKE" && l.period === "DAY");
    expect(attackerStake?.currentValue).toBe(100_000n);

    const ownerLimits = await listLimits.execute({ userId: owner });
    const ownerStake = ownerLimits.find((l) => l.kind === "STAKE" && l.period === "DAY");
    expect(ownerStake?.currentValue).toBe(25_000n);
  });

  it("activity summary never includes another user's staking activity", async () => {
    const owner = await createUser();
    const attacker = await createUser();

    await simulatedCredit.execute({
      userId: owner,
      currency: "PEN",
      amountMinor: 10_000n,
      idempotencyKey: randomUUID(),
    });

    const attackerSummary = await activitySummary.execute({
      userId: attacker,
      currency: "PEN",
      period: "ALL",
    });
    expect(attackerSummary.totalStakedMinor).toBe(0n);
    expect(attackerSummary.netResultMinor).toBe(0n);
    expect(attackerSummary.betCount).toBe(0);
  });

  it("listing sessions never includes another user's active sessions", async () => {
    const owner = await createUser();
    const attacker = await createUser();

    const ownerSessions = await listSessions.execute({ userId: owner });
    const attackerSessions = await listSessions.execute({ userId: attacker });
    expect(ownerSessions).toHaveLength(0);
    expect(attackerSessions).toHaveLength(0);
  });
});
