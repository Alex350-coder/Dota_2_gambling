import type { Pool } from "pg";
import { randomUUID } from "node:crypto";
import { createDb, createPool } from "@/infra/db/client";
import { DrizzleUnitOfWork, type DbTx } from "@/infra/db/uow";
import { LedgerService } from "@/infra/db/ledger";
import { CryptoIdGenerator } from "@/infra/id-generator";
import { SystemClock } from "@/infra/clock";
import { MVP_ECONOMIC_PROFILE } from "@/domain/catalog/economic-profile";
import { loadConfig } from "@/platform/config";

/** Marker slug used both to seed the game and to detect a prior seed run (idempotency). */
const SEED_GAME_SLUG = "dota-2-seed";
const SEED_FAUCET_CREDIT_MINOR = 100000n; // S/ 1,000.00 starting balance per seeded user

interface SeededUser {
  readonly id: string;
}

/** Refuses to run against a REAL-money database (RULE-K01) — seed data is simulated only. */
export async function runSeed(pool: Pool, moneyMode: string): Promise<void> {
  if (moneyMode !== "SIMULATED") {
    throw new Error(`db:seed refuses to run when MONEY_MODE=${moneyMode} (must be SIMULATED)`);
  }

  const existing = await pool.query(`SELECT 1 FROM games WHERE slug = $1`, [SEED_GAME_SLUG]);
  if ((existing.rowCount ?? 0) > 0) {
    console.log("db:seed: dev seed already present, skipping (idempotent no-op)");
    return;
  }

  const db = createDb(pool);
  const uow = new DrizzleUnitOfWork(db);
  const ledger = new LedgerService(new CryptoIdGenerator(), new SystemClock());

  const gameResult = await pool.query(
    `INSERT INTO games (slug, name) VALUES ($1, 'Dota 2') RETURNING id`,
    [SEED_GAME_SLUG],
  );
  const gameId = gameResult.rows[0].id as string;

  const gameModeResult = await pool.query(
    `INSERT INTO game_modes (game_id, name) VALUES ($1, 'Standard') RETURNING id`,
    [gameId],
  );
  const gameModeId = gameModeResult.rows[0].id as string;

  const tournamentResult = await pool.query(
    `INSERT INTO tournaments (game_id, name, starts_at) VALUES ($1, 'The International (Seed)', now()) RETURNING id`,
    [gameId],
  );
  const tournamentId = tournamentResult.rows[0].id as string;

  const matchIds: string[] = [];
  for (let i = 0; i < 3; i += 1) {
    const matchResult = await pool.query(
      `INSERT INTO matches (tournament_id, game_mode_id, scheduled_at) VALUES ($1, $2, now() + ($3 || ' hours')::interval) RETURNING id`,
      [tournamentId, gameModeId, i],
    );
    matchIds.push(matchResult.rows[0].id as string);
  }

  const marketTypeResult = await pool.query(
    `INSERT INTO market_types (code, name) VALUES ('match-winner-seed', 'Match Winner') RETURNING id`,
  );
  const marketTypeId = marketTypeResult.rows[0].id as string;

  const streamerUserIds: string[] = [];
  const streamerIds: string[] = [];
  for (let i = 0; i < 2; i += 1) {
    const userResult = await pool.query(
      `INSERT INTO users (email, date_of_birth) VALUES ($1, '1995-01-01') RETURNING id`,
      [`seed-streamer-${String(i)}@example.test`],
    );
    const userId = userResult.rows[0].id as string;
    streamerUserIds.push(userId);

    const streamerResult = await pool.query(
      `INSERT INTO streamers (user_id, display_name) VALUES ($1, $2) RETURNING id`,
      [userId, `Seed Streamer ${String(i + 1)}`],
    );
    streamerIds.push(streamerResult.rows[0].id as string);
  }

  const economicProfileResult = await pool.query(
    `INSERT INTO economic_profiles
       (odds_num, odds_den, streamer_commission_bps, platform_fee_bps, currency, min_stake_minor, max_stake_minor)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
    [
      MVP_ECONOMIC_PROFILE.oddsNum,
      MVP_ECONOMIC_PROFILE.oddsDen,
      MVP_ECONOMIC_PROFILE.streamerCommissionBps,
      MVP_ECONOMIC_PROFILE.platformFeeBps,
      MVP_ECONOMIC_PROFILE.currency,
      MVP_ECONOMIC_PROFILE.minStakeMinor.toString(),
      MVP_ECONOMIC_PROFILE.maxStakeMinor.toString(),
    ],
  );
  const economicProfileId = economicProfileResult.rows[0].id as string;

  const marketIds: string[] = [];
  const outcomeIdsByMarket: string[][] = [];
  for (let i = 0; i < 3; i += 1) {
    const marketResult = await pool.query(
      `INSERT INTO markets (match_id, market_type_id, streamer_id, economic_profile_id, status, closes_at)
       VALUES ($1, $2, $3, $4, 'OPEN', now() + interval '1 hour') RETURNING id`,
      [matchIds[i], marketTypeId, streamerIds[i % streamerIds.length], economicProfileId],
    );
    const marketId = marketResult.rows[0].id as string;
    marketIds.push(marketId);

    const outcomeAResult = await pool.query(
      `INSERT INTO outcomes (market_id, code, label) VALUES ($1, 'A', 'Team A') RETURNING id`,
      [marketId],
    );
    const outcomeBResult = await pool.query(
      `INSERT INTO outcomes (market_id, code, label) VALUES ($1, 'B', 'Team B') RETURNING id`,
      [marketId],
    );
    outcomeIdsByMarket.push([
      outcomeAResult.rows[0].id as string,
      outcomeBResult.rows[0].id as string,
    ]);
  }

  const users: SeededUser[] = [];
  for (let i = 0; i < 6; i += 1) {
    const userResult = await pool.query(
      `INSERT INTO users (email, date_of_birth) VALUES ($1, '1998-01-01') RETURNING id`,
      [`seed-user-${String(i)}@example.test`],
    );
    const userId = userResult.rows[0].id as string;
    users.push({ id: userId });

    await pool.query(
      `INSERT INTO wallets (user_id, currency, available_minor, locked_minor) VALUES ($1, $2, 0, 0)`,
      [userId, MVP_ECONOMIC_PROFILE.currency],
    );

    await uow.run((tx: DbTx) =>
      ledger.post(tx, {
        id: randomUUID(),
        kind: "FAUCET",
        referenceType: "bet_order",
        referenceId: userId,
        idempotencyKey: `seed-faucet-${userId}`,
        actorType: "SYSTEM",
        actorId: undefined,
        entries: [
          {
            accountKey: `USER_AVAILABLE:${userId}`,
            currency: MVP_ECONOMIC_PROFILE.currency,
            signedAmountMinor: SEED_FAUCET_CREDIT_MINOR,
          },
          {
            accountKey: "SIMULATION_FAUCET",
            currency: MVP_ECONOMIC_PROFILE.currency,
            signedAmountMinor: -SEED_FAUCET_CREDIT_MINOR,
          },
        ],
      }),
    );
  }

  // Reproduces Testing.md FIN-02: order A requests 100.00 (10000), order B requests
  // 30.00 (3000); B fully matches into A, leaving A with matched=3000, unmatched=7000
  // and MARKET_ESCROW holding 6000 (2 x matched).
  const bookMarketId = marketIds[0];
  const bookOutcomeId = outcomeIdsByMarket[0]?.[0];
  const userA = users[0]?.id;
  const userB = users[1]?.id;
  if (
    bookMarketId === undefined ||
    bookOutcomeId === undefined ||
    userA === undefined ||
    userB === undefined
  ) {
    throw new Error("db:seed: expected seeded markets/outcomes/users to be present");
  }

  const betSlipAResult = await pool.query(
    `INSERT INTO bet_slips (user_id) VALUES ($1) RETURNING id`,
    [userA],
  );
  const betSlipBResult = await pool.query(
    `INSERT INTO bet_slips (user_id) VALUES ($1) RETURNING id`,
    [userB],
  );

  const orderAResult = await pool.query(
    `INSERT INTO bet_orders
       (bet_slip_id, user_id, market_id, outcome_id, currency, requested_minor, matched_minor,
        unmatched_minor, released_minor, odds_num, odds_den, commission_bps, status, idempotency_key)
     VALUES ($1, $2, $3, $4, $5, 10000, 3000, 7000, 0, $6, $7, $8, 'OPEN', $9)
     RETURNING id`,
    [
      betSlipAResult.rows[0].id,
      userA,
      bookMarketId,
      bookOutcomeId,
      MVP_ECONOMIC_PROFILE.currency,
      MVP_ECONOMIC_PROFILE.oddsNum,
      MVP_ECONOMIC_PROFILE.oddsDen,
      MVP_ECONOMIC_PROFILE.streamerCommissionBps,
      "seed-order-a",
    ],
  );
  const orderAId = orderAResult.rows[0].id as string;

  const orderBResult = await pool.query(
    `INSERT INTO bet_orders
       (bet_slip_id, user_id, market_id, outcome_id, currency, requested_minor, matched_minor,
        unmatched_minor, released_minor, odds_num, odds_den, commission_bps, status, idempotency_key)
     VALUES ($1, $2, $3, $4, $5, 3000, 3000, 0, 0, $6, $7, $8, 'MATCHED', $9)
     RETURNING id`,
    [
      betSlipBResult.rows[0].id,
      userB,
      bookMarketId,
      bookOutcomeId,
      MVP_ECONOMIC_PROFILE.currency,
      MVP_ECONOMIC_PROFILE.oddsNum,
      MVP_ECONOMIC_PROFILE.oddsDen,
      MVP_ECONOMIC_PROFILE.streamerCommissionBps,
      "seed-order-b",
    ],
  );
  const orderBId = orderBResult.rows[0].id as string;

  await pool.query(
    `INSERT INTO match_allocations (market_id, order_a_id, order_b_id, sequence, matched_minor)
     VALUES ($1, $2, $3, 1, 3000)`,
    [bookMarketId, orderAId, orderBId],
  );

  await uow.run((tx: DbTx) =>
    ledger.post(tx, {
      id: randomUUID(),
      kind: "RESERVE",
      referenceType: "bet_order",
      referenceId: orderAId,
      idempotencyKey: `seed-reserve-${orderAId}`,
      actorType: "SYSTEM",
      actorId: undefined,
      entries: [
        {
          accountKey: `USER_AVAILABLE:${userA}`,
          currency: MVP_ECONOMIC_PROFILE.currency,
          signedAmountMinor: -10000n,
        },
        {
          accountKey: `USER_LOCKED:${userA}`,
          currency: MVP_ECONOMIC_PROFILE.currency,
          signedAmountMinor: 10000n,
        },
      ],
    }),
  );

  await uow.run((tx: DbTx) =>
    ledger.post(tx, {
      id: randomUUID(),
      kind: "RESERVE",
      referenceType: "bet_order",
      referenceId: orderBId,
      idempotencyKey: `seed-reserve-${orderBId}`,
      actorType: "SYSTEM",
      actorId: undefined,
      entries: [
        {
          accountKey: `USER_AVAILABLE:${userB}`,
          currency: MVP_ECONOMIC_PROFILE.currency,
          signedAmountMinor: -3000n,
        },
        {
          accountKey: `USER_LOCKED:${userB}`,
          currency: MVP_ECONOMIC_PROFILE.currency,
          signedAmountMinor: 3000n,
        },
      ],
    }),
  );

  await uow.run((tx: DbTx) =>
    ledger.post(tx, {
      id: randomUUID(),
      kind: "MATCH_ESCROW",
      referenceType: "match_allocation",
      referenceId: bookMarketId,
      idempotencyKey: `seed-match-escrow-${bookMarketId}`,
      actorType: "SYSTEM",
      actorId: undefined,
      entries: [
        {
          accountKey: `USER_LOCKED:${userA}`,
          currency: MVP_ECONOMIC_PROFILE.currency,
          signedAmountMinor: -3000n,
        },
        {
          accountKey: `USER_LOCKED:${userB}`,
          currency: MVP_ECONOMIC_PROFILE.currency,
          signedAmountMinor: -3000n,
        },
        {
          accountKey: `MARKET_ESCROW:${bookMarketId}`,
          currency: MVP_ECONOMIC_PROFILE.currency,
          signedAmountMinor: 6000n,
        },
      ],
    }),
  );

  console.log(
    `db:seed: seeded 1 game, 3 matches, 3 markets, 2 streamers, 6 users, book on market ${bookMarketId} (matched=3000, unmatched=7000, escrow=6000)`,
  );
}

async function main(): Promise<void> {
  const config = loadConfig();
  const pool = createPool(config);

  try {
    await runSeed(pool, config.MONEY_MODE);
  } finally {
    await pool.end();
  }
}

if (require.main === module) {
  void main();
}
