import http from "k6/http";
import { check } from "k6";

// MET-PERF-04: settlement of a 1000-allocation market <= 10s.
// Single-iteration scenario — settlement is an admin-triggered batch operation, not a
// per-request load pattern, so this intentionally runs once rather than under concurrent VUs.
//
// Requires a pre-seeded CLOSED market with exactly 1000 allocations and a CONFIRMED result
// (per Claude/domain/SETTLEMENT.md's propose/confirm flow) on the target environment:
//   - BASE_URL: app origin
//   - ADMIN_SESSION_COOKIE: a step-up-fresh admin session cookie
//   - MARKET_ID: the id of the pre-seeded 1000-allocation market

const BASE_URL = __ENV.BASE_URL || "http://localhost:3000";
const ADMIN_SESSION_COOKIE = __ENV.ADMIN_SESSION_COOKIE || "";
const MARKET_ID = __ENV.MARKET_ID || "";

export const options = {
  scenarios: {
    settle_once: {
      executor: "shared-iterations",
      vus: 1,
      iterations: 1,
      maxDuration: "30s",
    },
  },
  thresholds: {
    http_req_duration: ["max<10000"], // MET-PERF-04
  },
};

export default function run() {
  if (!ADMIN_SESSION_COOKIE || !MARKET_ID) {
    throw new Error(
      "settlement-batch.js requires ADMIN_SESSION_COOKIE and MARKET_ID env vars — " +
        "see the file header for the required fixture",
    );
  }

  const res = http.post(`${BASE_URL}/api/v1/admin/markets/${MARKET_ID}/settle`, null, {
    headers: { Cookie: ADMIN_SESSION_COOKIE },
  });

  check(res, { "settlement accepted": (r) => r.status === 200 || r.status === 202 });
}
