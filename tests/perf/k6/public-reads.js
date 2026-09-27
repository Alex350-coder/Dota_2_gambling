import http from "k6/http";
import { check, sleep } from "k6";

// MET-PERF-01: GET public page TTFB <= 300ms p95.
// MET-PERF-02: GET /api/v1/** read latency <= 200ms p95.
// MET-PERF-07: API 5xx error rate <= 0.1%.
// Load profile per Claude/ops/PERFORMANCE_SCALABILITY.md §2: 200 concurrent readers,
// 10-minute steady state, warm cache.

const BASE_URL = __ENV.BASE_URL || "http://localhost:3000";

export const options = {
  scenarios: {
    readers: {
      executor: "constant-vus",
      vus: 200,
      duration: "10m",
    },
  },
  thresholds: {
    "http_req_duration{group:::public_page}": ["p(95)<300"], // MET-PERF-01
    "http_req_duration{group:::api_read}": ["p(95)<200"], // MET-PERF-02
    http_req_failed: ["rate<0.001"], // MET-PERF-07
  },
};

const PUBLIC_PAGES = ["/", "/how-it-works", "/games", "/matches", "/streamers", "/faq"];
const API_READS = ["/api/v1/games", "/api/v1/matches", "/api/v1/markets", "/api/v1/streamers"];

export default function run() {
  const page = PUBLIC_PAGES[Math.floor(Math.random() * PUBLIC_PAGES.length)];
  const pageRes = http.get(`${BASE_URL}${page}`, { tags: { group: "public_page" } });
  check(pageRes, { "public page 2xx/3xx": (r) => r.status < 400 });

  const api = API_READS[Math.floor(Math.random() * API_READS.length)];
  const apiRes = http.get(`${BASE_URL}${api}`, { tags: { group: "api_read" } });
  check(apiRes, { "api read 2xx": (r) => r.status === 200 });

  sleep(1);
}
