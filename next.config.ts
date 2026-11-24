import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const nextConfig: NextConfig = {
  // Next dev treats 127.0.0.1 and localhost as different origins and blocks dev-only
  // resources (HMR socket, fonts, chunks) for hosts not in this list.
  allowedDevOrigins: ["127.0.0.1"],
  // ADR-005: the service worker must never be served from a cache, or a fix to it could take days
  // to reach people. Its own CSP only lets it load scripts from this site.
  async headers() {
    return [
      {
        source: "/sw.js",
        headers: [
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Content-Security-Policy", value: "default-src 'self'; script-src 'self'" },
        ],
      },
    ];
  },
};

export default withNextIntl(nextConfig);
