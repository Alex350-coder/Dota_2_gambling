import http from "k6/http";
import { check, sleep } from "k6";

// MET-PERF-03: POST /api/v1/bets end-to-end (incl. matching) <= 400ms p95, <= 800ms p99.
// MET-PERF-07: API 5xx error rate <= 0.1%.
// Load profile per Claude/ops/PERFORMANCE_SCALABILITY.md §2: 20 concurrent bettors
// placing into 5 markets.
//
// Requires pre-provisioned fixtures on the target environment (this is deliberately not a
// self-registering script, so it never creates real-looking accounts against a shared
// environment by accident):
//   - BASE_URL: app origin
//   - SESSION_COOKIES: JSON array of 20 pre-authenticated session cookie strings
//     (one bettor account per VU), e.g. '["session=...","session=..."]'
//   - MARKET_FIXTURES: JSON array of 5 { marketId, outcomeIds: [a, b] } objects for OPEN
//     markets with sufficient counterparty liquidity on both outcomes

const BASE_URL = __ENV.BASE_URL || "http://localhost:3000";
const SESSION_COOKIES = JSON.parse(__ENV.SESSION_COOKIES || "[]");
const MARKET_FIXTURES = JSON.parse(__ENV.MARKET_FIXTURES || "[]");

export const options = {
  scenarios: {
    bettors: {
      executor: "constant-vus",
      vus: Math.max(SESSION_COOKIES.length, 1),
      duration: "5m",
    },
  },
  thresholds: {
    http_req_duration: ["p(95)<400", "p(99)<800"],
    http_req_failed: ["rate<0.001"],
  },
};

export default function run() {
  if (SESSION_COOKIES.length === 0 || MARKET_FIXTURES.length === 0) {
    throw new Error(
      "bet-placement.js requires SESSION_COOKIES and MARKET_FIXTURES env vars — " +
        "see the file header for the expected shape",
    );
  }

  const cookie = SESSION_COOKIES[__VU % SESSION_COOKIES.length];
  const market = MARKET_FIXTURES[__VU % MARKET_FIXTURES.length];
  const outcomeId = market.outcomeIds[__ITER % market.outcomeIds.length];

  const res = http.post(
    `${BASE_URL}/api/v1/bets`,
    JSON.stringify({ marketId: market.marketId, outcomeId, amountMinor: "1000" }),
    {
      headers: {
        "Content-Type": "application/json",
        Cookie: cookie,
        "Idempotency-Key": `k6-${__VU}-${__ITER}-${Date.now()}`,
      },
    },
  );

  check(res, { "bet accepted (201)": (r) => r.status === 201 });
  sleep(2);
}
