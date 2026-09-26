/** Standalone diagnostic entry, also used by the host CLI. */
import { parseArgs } from 'node:util';
import { existsSync } from 'node:fs';
import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { runSelfcheck, report } from '../tools/selfcheck.js';

export async function checkCommand(args: string[]): Promise<number> {
    const { positionals, values } = parseArgs({ args: args, allowPositionals: true, options: {
      shot: { type: 'boolean', default: false }, 'shot-dir': { type: 'string', default: '/tmp/selfcheck' },
      wait: { type: 'string', default: '1200' }, after: { type: 'string', multiple: true, default: [] },
      crop: { type: 'string' }, zoom: { type: 'string', default: '2' }, json: { type: 'boolean', default: false },
      'text-report': { type: 'boolean', default: false },
    } });
    const files = (positionals.length ? positionals : (await readdir('.')).filter(name => name.startsWith('page-') && name.endsWith('.html')).sort()).filter(file => existsSync(file));
    if (!files.length) {
      process.stdout.write('没找到页面。用法: notale check page-01.html\n'); return 2;
    }
    const integer = (value: string, name: string) => {
      if (!/^[+-]?\d+$/.test(value.trim()) || !Number.isSafeInteger(Number(value))) throw new Error(`${name} requires an integer`);
      return Number(value);
    };
    const crop = values.crop ? values.crop.split(',').map(value => integer(value, '--crop')) : undefined;
    const result = await runSelfcheck(files, { wait: integer(values.wait, '--wait'), zoom: integer(values.zoom, '--zoom'), after: values.after,
      ...(values.shot || values.crop ? { shotDir: values['shot-dir'] } : {}), ...(crop ? { crop } : {}),
    });
    if (values.json) {
      process.stdout.write(JSON.stringify(result.map(([name, states]) => ({ page: name, states: states.map(state => ({
        after: state.label, js_error: state.js_error ?? null, result: state.result ?? null, ...(state.probe ?? {}),
        errors: state.errs, failed: state.bad, viewport_issues: state.viewport_issues ?? [], shot: state.png || null, crop: state.crop || null,
      })) })), null, 2) + '\n');
    } else process.stdout.write(result.map(([name, states]) => report(name, states, values['text-report'])).join(''));
    return 0;
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  checkCommand(process.argv.slice(2)).then(code => { process.exitCode = code; }).catch(error => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
