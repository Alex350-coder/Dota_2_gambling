import { sql } from "drizzle-orm";
import type {
  CloseWindowSignal,
  NewAccountBalanceSignal,
  NewDeviceSignal,
  OrderRateSignal,
  RepeatedPairing,
  RiskSignalReader,
  SharedDeviceMatch,
  StakeSpikeSignal,
} from "@/domain/ports";
import type { DbTx } from "./uow";

type QueryRow = Record<string, unknown>;

async function rows<T extends QueryRow>(tx: DbTx, query: ReturnType<typeof sql>): Promise<T[]> {
  const result = (await tx.execute(query)) as { rows: T[] };
  return result.rows;
}

/**
 * Drizzle implementation of `RiskSignalReader` (T-913/T-914) — one query per deterministic
 * fraud-rule signal (compliance/FRAUD_PREVENTION.md §3). SQL syntax against the real schema is
 * proven by tests/integration/application/risk/placement-rules-smoke.test.ts; the pure decision
 * logic that consumes these signals lives in `src/application/risk/rules.ts` and is unit-tested
 * against mocked results there.
 */
export class DrizzleRiskSignalReader implements RiskSignalReader {
  constructor(private readonly tx: DbTx) {}

  async findSharedDeviceOppositeSideMatch(
    orderId: string,
    windowMinutes: number,
  ): Promise<SharedDeviceMatch | null> {
    const [row] = await rows<{ market_id: string; other_user_id: string; other_order_id: string }>(
      this.tx,
      // eslint-disable-next-line project/no-raw-sql-concat -- drizzle sql`` parameterizes, not concatenates
      sql`
        WITH this_order AS (
          SELECT bo.id, bo.market_id, bo.outcome_id, bo.user_id,
                 (SELECT ip_hash FROM audit_events
                   WHERE action = 'BET_PLACED' AND entity_id = bo.id AND ip_hash IS NOT NULL
                   ORDER BY created_at DESC LIMIT 1) AS ip_hash
          FROM bet_orders bo WHERE bo.id = ${orderId}
        )
        SELECT bo2.market_id, bo2.user_id AS other_user_id, bo2.id AS other_order_id
        FROM this_order t
        JOIN audit_events ae2
          ON ae2.action = 'BET_PLACED' AND ae2.ip_hash = t.ip_hash
          AND ae2.created_at >= now() - (${windowMinutes} || ' minutes')::interval
        JOIN bet_orders bo2 ON bo2.id = ae2.entity_id
        WHERE t.ip_hash IS NOT NULL
          AND bo2.market_id = t.market_id
          AND bo2.outcome_id <> t.outcome_id
          AND bo2.user_id <> t.user_id
        LIMIT 1
      `,
    );

    return row
      ? {
          marketId: row.market_id,
          otherUserId: row.other_user_id,
          otherOrderId: row.other_order_id,
        }
      : null;
  }

  async findRepeatedPairings(
    orderId: string,
    minMarkets: number,
  ): Promise<readonly RepeatedPairing[]> {
    const result = await rows<{
      other_user_id: string;
      market_count: number;
      market_ids: string[];
    }>(
      this.tx,
      // eslint-disable-next-line project/no-raw-sql-concat -- drizzle sql`` parameterizes, not concatenates
      sql`
        WITH this_order AS (SELECT id, user_id FROM bet_orders WHERE id = ${orderId}),
        allocations AS (
          SELECT ma.market_id,
                 CASE WHEN a.user_id = t.user_id THEN b.user_id ELSE a.user_id END AS other_user_id
          FROM match_allocations ma
          JOIN this_order t ON ma.order_a_id = t.id OR ma.order_b_id = t.id
          JOIN bet_orders a ON a.id = ma.order_a_id
          JOIN bet_orders b ON b.id = ma.order_b_id
        )
        SELECT other_user_id, COUNT(DISTINCT market_id)::int AS market_count,
               array_agg(DISTINCT market_id) AS market_ids
        FROM allocations
        GROUP BY other_user_id
        HAVING COUNT(DISTINCT market_id) >= ${minMarkets}
      `,
    );

    return result.map((row) => ({
      otherUserId: row.other_user_id,
      marketCount: row.market_count,
      marketIds: row.market_ids,
    }));
  }

  async getOrderRateLastMinute(orderId: string): Promise<OrderRateSignal | null> {
    const [row] = await rows<{ user_id: string; recent_count: number }>(
      this.tx,
      // eslint-disable-next-line project/no-raw-sql-concat -- drizzle sql`` parameterizes, not concatenates
      sql`
        WITH this_order AS (SELECT user_id FROM bet_orders WHERE id = ${orderId})
        SELECT t.user_id, COUNT(*)::int AS recent_count
        FROM this_order t
        JOIN bet_orders bo ON bo.user_id = t.user_id AND bo.created_at >= now() - interval '1 minute'
        GROUP BY t.user_id
      `,
    );

    return row ? { userId: row.user_id, recentCount: row.recent_count } : null;
  }

  async getStakeSpikeSignal(orderId: string): Promise<StakeSpikeSignal | null> {
    const [row] = await rows<{
      user_id: string;
      requested_minor: string;
      median_minor: string | null;
      prior_count: number;
    }>(
      this.tx,
      // eslint-disable-next-line project/no-raw-sql-concat -- drizzle sql`` parameterizes, not concatenates
      sql`
        WITH this_order AS (SELECT id, user_id, requested_minor FROM bet_orders WHERE id = ${orderId}),
        prior AS (
          SELECT bo.requested_minor
          FROM bet_orders bo, this_order t
          WHERE bo.user_id = t.user_id AND bo.id <> t.id
            AND bo.created_at >= now() - interval '30 days'
        )
        SELECT t.user_id, t.requested_minor::text,
               (SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY requested_minor) FROM prior)::text AS median_minor,
               (SELECT COUNT(*) FROM prior)::int AS prior_count
        FROM this_order t
      `,
    );

    return row
      ? {
          userId: row.user_id,
          requestedMinor: row.requested_minor,
          medianMinor: row.median_minor,
          priorCount: row.prior_count,
        }
      : null;
  }

  async getNewAccountBalanceSignal(orderId: string): Promise<NewAccountBalanceSignal | null> {
    const [row] = await rows<{
      user_id: string;
      requested_minor: string;
      available_minor: string;
      account_age_minutes: number;
    }>(
      this.tx,
      // eslint-disable-next-line project/no-raw-sql-concat -- drizzle sql`` parameterizes, not concatenates
      sql`
        SELECT bo.user_id, bo.requested_minor::text, COALESCE(w.available_minor, 0)::text AS available_minor,
               EXTRACT(EPOCH FROM (now() - u.created_at)) / 60 AS account_age_minutes
        FROM bet_orders bo
        JOIN users u ON u.id = bo.user_id
        LEFT JOIN wallets w ON w.user_id = bo.user_id AND w.currency = bo.currency
        WHERE bo.id = ${orderId}
      `,
    );

    return row
      ? {
          userId: row.user_id,
          requestedMinor: row.requested_minor,
          availableMinor: row.available_minor,
          accountAgeMinutes: row.account_age_minutes,
        }
      : null;
  }

  async getNewDeviceSignal(
    orderId: string,
    windowMinutes: number,
  ): Promise<NewDeviceSignal | null> {
    const [row] = await rows<{
      user_id: string;
      session_id: string | null;
      ip_hash: string | null;
      session_age_minutes: number | null;
      prior_sightings: number;
    }>(
      this.tx,
      // eslint-disable-next-line project/no-raw-sql-concat -- drizzle sql`` parameterizes, not concatenates
      sql`
        WITH order_actor AS (
          SELECT bo.user_id,
                 (SELECT ip_hash FROM audit_events
                   WHERE action = 'BET_PLACED' AND entity_id = bo.id AND ip_hash IS NOT NULL
                   ORDER BY created_at DESC LIMIT 1) AS ip_hash
          FROM bet_orders bo WHERE bo.id = ${orderId}
        ),
        recent_session AS (
          SELECT s.id, s.user_id, s.ip_hash, s.created_at
          FROM sessions s, order_actor oa
          WHERE s.user_id = oa.user_id AND s.ip_hash = oa.ip_hash
          ORDER BY s.created_at DESC LIMIT 1
        )
        SELECT oa.user_id, rs.id AS session_id, oa.ip_hash,
               EXTRACT(EPOCH FROM (now() - rs.created_at)) / 60 AS session_age_minutes,
               (SELECT COUNT(*) FROM sessions prior
                 WHERE prior.user_id = oa.user_id AND prior.ip_hash = oa.ip_hash
                   AND prior.id <> rs.id AND prior.created_at < rs.created_at)::int AS prior_sightings
        FROM order_actor oa
        LEFT JOIN recent_session rs ON true
      `,
    );

    if (!row?.ip_hash || !row.session_id || row.session_age_minutes === null) {
      return null;
    }
    if (row.session_age_minutes > windowMinutes) {
      return null;
    }

    return {
      userId: row.user_id,
      sessionId: row.session_id,
      ipHash: row.ip_hash,
      sessionAgeMinutes: row.session_age_minutes,
      priorSightings: row.prior_sightings,
    };
  }

  async getCloseWindowOrderCount(
    marketId: string,
    windowSeconds: number,
  ): Promise<CloseWindowSignal> {
    const [row] = await rows<{ order_count: number }>(
      this.tx,
      // eslint-disable-next-line project/no-raw-sql-concat -- drizzle sql`` parameterizes, not concatenates
      sql`
        SELECT COUNT(*)::int AS order_count
        FROM bet_orders bo
        JOIN markets m ON m.id = bo.market_id
        WHERE bo.market_id = ${marketId}
          AND m.closes_at IS NOT NULL
          AND bo.created_at >= m.closes_at - (${windowSeconds} || ' seconds')::interval
          AND bo.created_at <= m.closes_at
      `,
    );

    return { orderCount: row?.order_count ?? 0 };
  }
}
