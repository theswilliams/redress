import type { NextConfig } from "next";
import { SECURITY_HEADERS, contentSecurityPolicy } from "./src/lib/securityHeaders";

const nextConfig: NextConfig = {
  async headers() {
    return [
      { source: "/:path*", headers: SECURITY_HEADERS },
      // Pages only: API routes return JSON, and the document download sets its own sandboxing CSP.
      { source: "/((?!api/).*)", headers: [{ key: "Content-Security-Policy", value: contentSecurityPolicy() }] },
    ];
  },
};

export default nextConfig;
