import { existsSync, mkdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";

/**
 * WebKit refuses to send `Secure` cookies (RULE mandated exactly by Security.md §5) over plain
 * HTTP, even to `localhost` — unlike Chromium/Firefox, it does not extend the "potentially
 * trustworthy origin" exception to the cookie store. The E2E webServer must therefore actually
 * be HTTPS for tests/e2e/betting.spec.ts's real-browser session cookie to reach the server on
 * WebKit. Generates a throwaway self-signed localhost cert (gitignored, regenerated on demand)
 * instead of ever relaxing the cookie's Secure attribute.
 */
const certDir = path.join(process.cwd(), ".e2e-certs");
const keyPath = path.join(certDir, "key.pem");
const certPath = path.join(certDir, "cert.pem");

if (!existsSync(keyPath) || !existsSync(certPath)) {
  mkdirSync(certDir, { recursive: true });
  execFileSync(
    "openssl",
    [
      "req",
      "-x509",
      "-newkey",
      "rsa:2048",
      "-keyout",
      keyPath,
      "-out",
      certPath,
      "-days",
      "3650",
      "-nodes",
      // A leading "//" (not "/") keeps Git-Bash/MSYS's automatic POSIX-path rewriting from
      // mangling this into a filesystem path on local Windows dev machines; harmless on
      // Linux/CI where no such rewriting happens.
      "-subj",
      "//CN=localhost",
      "-addext",
      "subjectAltName=DNS:localhost,IP:127.0.0.1",
    ],
    {
      // Skips the system default openssl.cnf. On Git-for-Windows/MSYS its bundled config's
      // [v3_ca] section (the default `-x509` extensions target) fails to parse; on Linux/CI
      // this is a no-op fallback to OpenSSL's built-in defaults. This cert needs no CA
      // extensions either way since Playwright's ignoreHTTPSErrors skips validation.
      env: { ...process.env, OPENSSL_CONF: "" },
    },
  );
}
