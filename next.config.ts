import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const nextConfig: NextConfig = {
  // Next dev treats 127.0.0.1 and localhost as different origins and blocks dev-only
  // resources (HMR socket, fonts, chunks) for hosts not in this list.
  allowedDevOrigins: ["127.0.0.1"],
};

export default withNextIntl(nextConfig);
