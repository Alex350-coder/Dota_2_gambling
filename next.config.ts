import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Avoid fingerprinting the framework/version to clients (OWASP info-disclosure hardening).
  poweredByHeader: false,
};

export default nextConfig;
