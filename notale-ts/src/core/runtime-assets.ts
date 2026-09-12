import { cp, mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

function packageRoot(): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  return here.includes(`${path.sep}dist${path.sep}`) ? path.resolve(here, "../..") : path.resolve(here, "../..");
}

export async function installCodeRuntime(outputDir: string, packages: string[]): Promise<void> {
  const root = packageRoot();
  const built = path.join(root, "dist/browser/runtime");
  const target = path.join(outputDir, "assets/runtime");
  await cp(built, target, { recursive: true, dereference: true });
  const lock = JSON.parse(await readFile(path.join(built, "pyodide/pyodide-lock.json"), "utf8")) as { packages: Record<string, { file_name: string }> };
  await mkdir(path.join(target, "pyodide"), { recursive: true });
  for (const name of new Set(packages)) {
    const entry = lock.packages[name];
    if (!entry) throw new Error(`Unknown Pyodide package: ${name}`);
    await cp(path.join(root, "dist/browser/packages", entry.file_name), path.join(target, "pyodide", entry.file_name));
  }
}
