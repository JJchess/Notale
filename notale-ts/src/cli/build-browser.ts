import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const sourceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../src/browser/code-workbench");
const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const output = path.join(packageRoot, "dist/browser/runtime");
const packageOutput = path.join(packageRoot, "dist/browser/packages");
await rm(output, { recursive: true, force: true });
await rm(packageOutput, { recursive: true, force: true });
await mkdir(path.join(output, "pyodide"), { recursive: true });
await mkdir(packageOutput, { recursive: true });

await build({
  entryPoints: {
    "chassis": path.resolve(sourceRoot, "../chassis.ts"),
    "code-workbench": path.join(sourceRoot, "index.ts"),
    "monaco-worker": path.join(sourceRoot, "monaco-worker.ts"),
    "python-worker": path.join(sourceRoot, "python-worker.ts"),
  },
  bundle: true,
  format: "esm",
  platform: "browser",
  target: ["es2022"],
  outdir: output,
  entryNames: "[name]",
  assetNames: "assets/[name]-[hash]",
  loader: { ".ttf": "file" },
  minify: true,
  sourcemap: false,
  logLevel: "warning",
});

for (const name of ["pyodide.asm.mjs", "pyodide.asm.wasm", "pyodide.mjs", "python_stdlib.zip", "pyodide-lock.json"] as const) {
  await cp(path.join(packageRoot, "node_modules/pyodide", name), path.join(output, "pyodide", name));
}

const licenses = [
  { name: "monaco-editor", version: "0.55.1", license: "MIT", source: "https://github.com/microsoft/monaco-editor" },
  { name: "pyodide", version: "314.0.6", license: "MPL-2.0", source: "https://github.com/pyodide/pyodide" },
];
await writeFile(path.join(output, "licenses.json"), `${JSON.stringify(licenses, null, 2)}\n`, "utf8");
await cp(path.join(packageRoot, "node_modules/monaco-editor/LICENSE"), path.join(output, "MONACO-LICENSE.txt"));
await cp(path.join(packageRoot, "node_modules/monaco-editor/ThirdPartyNotices.txt"), path.join(output, "MONACO-THIRD-PARTY-NOTICES.txt"));
await cp(path.join(packageRoot, "third_party/PYODIDE-LICENSE.txt"), path.join(output, "PYODIDE-LICENSE.txt"));

const lock = JSON.parse(await readFile(path.join(output, "pyodide", "pyodide-lock.json"), "utf8")) as { packages: Record<string, { file_name: string; sha256: string }> };
const requested = (process.env.NOTALE_BUNDLE_PYTHON_PACKAGES ?? "numpy").split(",").map((name) => name.trim()).filter(Boolean);
for (const name of requested) {
  if (!lock.packages[name]) throw new Error(`Unknown Pyodide package: ${name}`);
  const file = lock.packages[name].file_name;
  const source = process.env.NOTALE_PYODIDE_PACKAGE_URL ?? "https://cdn.jsdelivr.net/pyodide/v314.0.6/full";
  const response = await fetch(`${source.replace(/\/$/, "")}/${file}`);
  if (!response.ok) throw new Error(`Unable to download ${name}: HTTP ${response.status}`);
  const body = new Uint8Array(await response.arrayBuffer());
  const digest = createHash("sha256").update(body).digest("hex");
  if (digest !== lock.packages[name].sha256) throw new Error(`Hash mismatch for ${name}: ${digest}`);
  await writeFile(path.join(packageOutput, file), body);
}
