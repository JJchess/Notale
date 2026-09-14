import type { NextConfig } from "next";

const apiOrigin = process.env.NOTALE_API_URL ?? "http://127.0.0.1:4321";

const config: NextConfig = {
  async rewrites() {
    return [
      { source: "/notale-api/:path*", destination: `${apiOrigin}/:path*` },
      ...(process.env.NOTALE_LEGACY_PREVIEW_URL ? [{ source: '/experiments/:path*', destination: `${process.env.NOTALE_LEGACY_PREVIEW_URL}/experiments/:path*` }] : []),
    ];
  },
};

export default config;
