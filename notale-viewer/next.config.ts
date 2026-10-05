import type { NextConfig } from "next";

// Read when building: `next build` freezes rewrites, so set NOTALE_API_URL for the build.
const apiOrigin = process.env.NOTALE_API_URL ?? "http://127.0.0.1:4321";

const config: NextConfig = {
  // A separate output keeps candidate previews from replacing a running stable build.
  distDir: process.env.NOTALE_DIST_DIR ?? ".next",
  experimental: { proxyClientMaxBodySize: "101mb" },
  async rewrites() {
    return [
      { source: "/notale-api/:path*", destination: `${apiOrigin}/:path*` },
      // Sessions are served by the same notale-ts server (`serve --sessions`).
      { source: "/notale-session/v1/:path*", destination: `${apiOrigin}/v1/:path*` },
      ...(process.env.NOTALE_LEGACY_PREVIEW_URL ? [{ source: '/experiments/:path*', destination: `${process.env.NOTALE_LEGACY_PREVIEW_URL}/experiments/:path*` }] : []),
    ];
  },
};

export default config;
