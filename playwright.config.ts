import { defineConfig, devices } from "@playwright/test";

/**
 * Installed for T-010; wired into CI by .github/workflows/e2e.yml (warning-only on
 * ordinary PRs, blocking on the nightly run and release PRs — CI_CD.md §4).
 *
 * Served over HTTPS (self-signed, scripts/e2e-generate-cert.ts) rather than plain HTTP: the
 * session cookie is `Secure` exactly per Security.md §5 (never relaxed for tests), and WebKit —
 * unlike Chromium/Firefox — refuses to send `Secure` cookies over plain HTTP even to localhost,
 * so tests/e2e/betting.spec.ts's real-browser bet placement would silently lose its session on
 * the webkit project otherwise.
 */
export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  ...(process.env.CI ? { workers: 1 } : {}),
  reporter: [["html", { open: "never" }]],
  use: {
    baseURL: "https://localhost:3000",
    ignoreHTTPSErrors: true,
    trace: "on-first-retry",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "webkit", use: { ...devices["Desktop Safari"] } },
  ],
  webServer: {
    command:
      "pnpm exec tsx scripts/e2e-generate-cert.ts && pnpm build && pnpm exec tsx scripts/e2e-https-server.ts",
    url: "https://localhost:3000",
    ignoreHTTPSErrors: true,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
