import type { NextConfig } from "next";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";

const distDir = process.env.NEXT_DIST_DIR ?? ".next";
// Next appends generated-type paths to its tsconfig. Keep isolated releases from
// accumulating those paths in the source config or checking earlier releases.
const sourceConfig = JSON.parse(readFileSync("tsconfig.json", "utf8"));
const tsconfigPath = `.next-typecheck-${createHash("sha256").update(distDir).digest("hex").slice(0, 12)}.json`;
const generated =
  JSON.stringify(
    {
      ...sourceConfig,
      include: [
        ...sourceConfig.include.filter(
          (path: string) => !path.startsWith(".next"),
        ),
        `${distDir}/types/**/*.ts`,
        `${distDir}/dev/types/**/*.ts`,
      ],
    },
    null,
    2,
  ) + "\n";
let previous: string | undefined;
try {
  previous = readFileSync(tsconfigPath, "utf8");
} catch (error) {
  if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
}
if (previous !== generated) writeFileSync(tsconfigPath, generated);

const config: NextConfig = {
  distDir,
  typescript: { tsconfigPath },
  poweredByHeader: false,
  webpack(config) {
    config.resolve.extensionAlias = {
      ...config.resolve.extensionAlias,
      ".js": [".ts", ".tsx", ".js"],
    };
    return config;
  },
};
export default config;
