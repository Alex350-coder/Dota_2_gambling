import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { expect, test } from "@playwright/test";

/**
 * Exercises the real bet-form UI end-to-end (T-716, the one Playwright spec mandated by
 * Tasks.md/CI): register -> verify -> login through the real running server (proving session +
 * CSRF cookies actually reach the browser, following auth.spec.ts's pattern), then place a bet
 * through the rendered market page against a pre-seeded opposing resting order sized to force a
 * deterministic partial match, and assert the resulting order card reflects exactly that —
 * server-confirmed numbers only, never a client-side guess (UI.md §5).
 */
test("place a bet and observe a partial match on the market page", async ({ page }) => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const email = `e2e-bet-${randomUUID()}@example.test`;
    const password = "a-strong-passphrase-42";

    // Uses page.request (not the standalone `request` fixture) so the session/CSRF cookies set
    // by these calls land in the same cookie jar the browser page sends requests from.
    const registerResponse = await page.request.post("/api/v1/auth/register", {
      data: { email, password, dateOfBirth: "1990-01-01" },
    });
    expect(registerResponse.status()).toBe(201);
    const { userId } = (await registerResponse.json()) as { userId: string };

    const { rows: outboxRows } = await pool.query<{ payload: { data: { token: string } } }>(
      "SELECT payload FROM outbox WHERE topic = 'mail' AND payload->>'to' = $1 ORDER BY created_at DESC LIMIT 1",
      [email],
    );
    const verifyToken = outboxRows[0]?.payload.data.token;
    if (!verifyToken) {
      throw new Error("verification email not found in outbox");
    }
    const verifyResponse = await page.request.post("/api/v1/auth/verify-email", {
      data: { token: verifyToken },
    });
    expect(verifyResponse.status()).toBe(200);

    const loginResponse = await page.request.post("/api/v1/auth/login", {
      data: { email, password },
    });
    expect(loginResponse.status()).toBe(200);

    // The incoming stake (5000 minor units) against a resting opposing order sized at 3000
    // deterministically matches 3000 and leaves 2000 unmatched (same fixed odds both sides, so
    // the allocation amount is simply min(incoming, resting) — see plan.test.ts).
    const incomingStakeMinor = 5000;
    const restingStakeMinor = 3000;

    await pool.query("UPDATE users SET status = 'ACTIVE' WHERE id = $1", [userId]);
    await pool.query(
      `INSERT INTO wallets (user_id, currency, available_minor, locked_minor)
       VALUES ($1, 'PEN', $2, 0)`,
      [userId, incomingStakeMinor],
    );

    const restingUser = await pool.query(
      `INSERT INTO users (email, date_of_birth, status) VALUES ($1, '1990-01-01', 'ACTIVE') RETURNING id`,
      [`e2e-resting-${randomUUID()}@example.test`],
    );
    const restingUserId = restingUser.rows[0].id as string;
    await pool.query(
      `INSERT INTO wallets (user_id, currency, available_minor, locked_minor)
       VALUES ($1, 'PEN', 0, $2)`,
      [restingUserId, restingStakeMinor],
    );

    const streamerUser = await pool.query(
      `INSERT INTO users (email, date_of_birth, status) VALUES ($1, '1990-01-01', 'ACTIVE') RETURNING id`,
      [`e2e-streamer-${randomUUID()}@example.test`],
    );
    const streamerUserId = streamerUser.rows[0].id as string;

    const marketId = await seedOpenMarket(pool, streamerUserId);
    const outcomeA = await pool.query(
      `INSERT INTO outcomes (market_id, code, label) VALUES ($1, 'A', 'Team A') RETURNING id`,
      [marketId],
    );
    const outcomeAId = outcomeA.rows[0].id as string;
    const outcomeB = await pool.query(
      `INSERT INTO outcomes (market_id, code, label) VALUES ($1, 'B', 'Team B') RETURNING id`,
      [marketId],
    );
    const outcomeBId = outcomeB.rows[0].id as string;

    const restingBetSlip = await pool.query(
      `INSERT INTO bet_slips (user_id) VALUES ($1) RETURNING id`,
      [restingUserId],
    );
    const restingBetSlipId = restingBetSlip.rows[0].id as string;
    await pool.query(
      `INSERT INTO bet_orders
         (id, bet_slip_id, user_id, market_id, outcome_id, currency, requested_minor, matched_minor,
          unmatched_minor, released_minor, odds_num, odds_den, commission_bps, status,
          idempotency_key, created_at)
       VALUES ($1, $2, $3, $4, $5, 'PEN', $6, 0, $6, 0, 18, 10, 2000, 'OPEN', $7, now())`,
      [
        randomUUID(),
        restingBetSlipId,
        restingUserId,
        marketId,
        outcomeBId,
        restingStakeMinor,
        `key-${randomUUID()}`,
      ],
    );

    await page.goto(`/markets/${marketId}`);
    await expect(page.getByRole("heading", { name: "Place a bet" })).toBeVisible();

    await page.locator("#bet-outcome").selectOption(outcomeAId);
    await page.locator("#bet-amount").fill(String(incomingStakeMinor));
    await page.getByRole("button", { name: "Place bet" }).click();

    const orderCard = page
      .getByText(/^Order [0-9a-f]{8}$/)
      .locator("..")
      .locator("..");
    await expect(orderCard.getByText("PARTIALLY_MATCHED")).toBeVisible();
    await expect(orderCard).toContainText("PEN 50.00"); // requested
    await expect(orderCard).toContainText("PEN 30.00"); // matched
    await expect(orderCard).toContainText("PEN 20.00"); // unmatched
  } finally {
    await pool.end();
  }
});

async function seedOpenMarket(pool: Pool, streamerUserId: string): Promise<string> {
  const gameResult = await pool.query(
    `INSERT INTO games (slug, name) VALUES ($1, 'Dota 2') RETURNING id`,
    [`dota2-${randomUUID()}`],
  );
  const gameId = gameResult.rows[0].id as string;

  const gameModeResult = await pool.query(
    `INSERT INTO game_modes (game_id, name) VALUES ($1, 'Standard') RETURNING id`,
    [gameId],
  );
  const gameModeId = gameModeResult.rows[0].id as string;

  const tournamentResult = await pool.query(
    `INSERT INTO tournaments (game_id, name, starts_at) VALUES ($1, 'The International', now()) RETURNING id`,
    [gameId],
  );
  const tournamentId = tournamentResult.rows[0].id as string;

  const matchResult = await pool.query(
    `INSERT INTO matches (tournament_id, game_mode_id, scheduled_at) VALUES ($1, $2, now()) RETURNING id`,
    [tournamentId, gameModeId],
  );
  const matchId = matchResult.rows[0].id as string;

  const marketTypeResult = await pool.query(
    `INSERT INTO market_types (code, name) VALUES ($1, 'Match Winner') RETURNING id`,
    [`match-winner-${randomUUID()}`],
  );
  const marketTypeId = marketTypeResult.rows[0].id as string;

  const streamerResult = await pool.query(
    `INSERT INTO streamers (user_id, display_name) VALUES ($1, 'E2E Streamer') RETURNING id`,
    [streamerUserId],
  );
  const streamerId = streamerResult.rows[0].id as string;

  const profileResult = await pool.query(
    `INSERT INTO economic_profiles
       (odds_num, odds_den, streamer_commission_bps, platform_fee_bps, currency, min_stake_minor, max_stake_minor)
     VALUES (18, 10, 2000, 0, 'PEN', 100, 10000000) RETURNING id`,
  );
  const economicProfileId = profileResult.rows[0].id as string;

  const marketResult = await pool.query(
    `INSERT INTO markets (match_id, market_type_id, streamer_id, economic_profile_id, closes_at, status)
     VALUES ($1, $2, $3, $4, now() + interval '1 hour', 'OPEN') RETURNING id`,
    [matchId, marketTypeId, streamerId, economicProfileId],
  );
  return marketResult.rows[0].id as string;
}
