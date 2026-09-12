import type { NextConfig } from "next";

const apiOrigin = process.env.NOTALE_API_URL ?? "http://127.0.0.1:4321";

const config: NextConfig = {
  async rewrites() {
    return [{ source: "/notale-api/:path*", destination: `${apiOrigin}/:path*` }];
  },
};

export default config;
