import ts from "typescript";
import { resolve, relative, isAbsolute } from "node:path";
import { statSync } from "node:fs";

const cwd = process.cwd();
const requested = process.argv.slice(2);
if (!requested.length) {
  console.error("Usage: npm run typecheck:files -- src/file.ts tests/file.test.ts");
  process.exit(2);
}
const files = requested.map(file => {
  const absolute = resolve(cwd, file), local = relative(cwd, absolute);
  if (isAbsolute(local) || local === ".." || local.startsWith("../") || !/\.tsx?$/.test(file) || !statSync(absolute).isFile())
    throw Error(`Expected a TypeScript file inside this project: ${file}`);
  return absolute;
});
const configPath = ts.findConfigFile(cwd, ts.sys.fileExists, "tsconfig.json");
if (!configPath) throw Error("tsconfig.json not found");
const config = ts.readConfigFile(configPath, ts.sys.readFile);
const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, cwd);
const ambient = parsed.fileNames.filter(file => file.endsWith(".d.ts"));
const program = ts.createProgram({
  rootNames: [...new Set([...files, ...ambient])],
  options: { ...parsed.options, noEmit: true, incremental: false, tsBuildInfoFile: undefined },
});
const diagnostics = [
  ...(config.error ? [config.error] : []),
  ...parsed.errors,
  ...ts.getPreEmitDiagnostics(program),
];
if (diagnostics.length) {
  console.error(ts.formatDiagnosticsWithColorAndContext(diagnostics, {
    getCurrentDirectory: () => cwd,
    getCanonicalFileName: file => file,
    getNewLine: () => ts.sys.newLine,
  }));
  process.exitCode = 1;
} else {
  console.log(`Checked ${files.length} selected file(s), their imports and project declarations. Final build still required.`);
}
