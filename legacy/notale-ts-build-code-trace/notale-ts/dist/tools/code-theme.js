/** Resolve lecture tokens once, then package a local code-only palette. */
import { createHash, randomUUID } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { writeFile, unlink } from 'node:fs/promises';
import path from 'node:path';
import postcss from 'postcss';
import { monacoTheme } from '../browser/code-workbench/theme.js';
import { acquireVisualChecker, browser, staticServer } from './visual-check.js';
const pending = new Map();
async function resolveTheme(pages, signal) {
    const assets = path.join(pages, 'assets'), file = `.code-theme-${randomUUID()}.html`;
    const release = acquireVisualChecker();
    let page;
    const abort = () => { void page?.close().catch(() => { }); };
    signal?.addEventListener('abort', abort, { once: true });
    try {
        signal?.throwIfAborted();
        await writeFile(path.join(assets, file), '<!doctype html><meta charset="utf-8"><link rel="stylesheet" href="theme.css"><div id="stage"></div>');
        const { origin } = await staticServer(assets);
        page = await (await browser()).newPage({ viewport: { width: 1600, height: 900 } });
        signal?.throwIfAborted();
        await page.goto(`${origin}/${file}`, { waitUntil: 'load' });
        return await page.evaluate(String.raw `(() => {
      const stage = document.querySelector('#stage'), style = getComputedStyle(stage);
      const canvas = document.createElement('canvas'); canvas.width = canvas.height = 1;
      const context = canvas.getContext('2d', { willReadFrequently: true });
      const color = (names, fallback) => {
        const raw = names.map(name => style.getPropertyValue(name).trim()).find(value => value && CSS.supports('color', value)) || fallback;
        context.clearRect(0, 0, 1, 1); context.fillStyle = fallback; context.fillRect(0, 0, 1, 1); context.fillStyle = raw; context.fillRect(0, 0, 1, 1);
        return '#' + [...context.getImageData(0, 0, 1, 1).data].slice(0, 3).map(value => value.toString(16).padStart(2, '0')).join('');
      };
      const mix = (a, b, weight) => '#' + [1, 3, 5].map(offset => Math.round(parseInt(a.slice(offset, offset + 2), 16) * (1 - weight) + parseInt(b.slice(offset, offset + 2), 16) * weight).toString(16).padStart(2, '0')).join('');
      const background = color(['--bg', '--background'], '#181818'), foreground = color(['--text', '--foreground', '--ink'], '#cccccc');
      const accent = color(['--accent', '--primary', '--blue'], foreground);
      return { background, foreground, accent, fontFamily: style.getPropertyValue('--font-sans').trim(), surface: mix(background, foreground, 0.04),
        muted: color(['--muted', '--text-secondary', '--ink-secondary'], mix(background, foreground, 0.68)), border: color(['--line', '--border'], mix(background, foreground, 0.2)),
        success: color(['--success', '--green'], accent), warning: color(['--warning', '--amber', '--yellow'], accent), error: color(['--error', '--danger', '--red'], '#bf4545') };
    })()`);
    }
    catch (error) {
        if (signal?.aborted)
            throw signal.reason;
        throw error;
    }
    finally {
        signal?.removeEventListener('abort', abort);
        await page?.close().catch(() => { });
        await unlink(path.join(assets, file)).catch(() => { });
        await release();
    }
}
export async function installCodeTheme(pages, assets, signal) {
    const source = path.join(pages, 'assets/theme.css');
    if (!existsSync(source)) {
        await writeFile(path.join(assets, 'code-theme.js'), 'window.NotaleCodeTheme=null;\n');
        await writeFile(path.join(assets, 'code-theme.css'), '');
        return;
    }
    const key = pages + ':' + createHash('sha256').update(readFileSync(source)).digest('hex');
    let resolved = pending.get(key);
    if (!resolved) {
        resolved = resolveTheme(pages, signal);
        pending.set(key, resolved);
        void resolved.catch(() => { pending.delete(key); });
        if (pending.size > 32)
            pending.delete(pending.keys().next().value);
    }
    const { fontFamily, ...theme } = await resolved;
    signal?.throwIfAborted();
    const monaco = monacoTheme(theme), scheme = monaco.base === 'vs' ? 'light' : 'dark';
    const variables = { bg: theme.background, workbench: theme.background, editor: theme.surface, panel: theme.surface, surface: theme.surface,
        'surface-active': theme.border, line: theme.border, 'line-strong': theme.muted, text: theme.foreground, 'text-bright': theme.foreground,
        muted: theme.muted, faint: theme.muted, blue: theme.accent, bar: theme.accent, active: theme.accent, changed: theme.warning,
        success: theme.success, danger: theme.error, warning: theme.warning, focus: theme.accent,
        'code-icon': theme.accent, 'code-tab-muted': theme.muted, 'code-hover': theme.surface, 'code-pane': theme.background, 'code-viz': theme.background, 'code-stage-line': theme.border,
        'code-active-bg': theme.accent + '1a', 'code-active-border': theme.accent + '33' };
    let fontCss = '';
    if (existsSync(path.join(pages, '../template-spec.json')) && fontFamily) {
        variables['font-sans'] = fontFamily;
        const css = postcss.parse(readFileSync(source, 'utf8'));
        css.walkAtRules('font-face', rule => {
            // The code palette lives two levels below assets/theme.css.
            fontCss += rule.toString().replace(/url\((["']?)(?!data:|#)([^)]+)\)/g, (_all, quote, url) => 'url(' + quote + '../../' + url + ')') + '\n';
        });
    }
    const native = { 'bg-0': theme.background, 'bg-1': theme.surface, ink: theme.foreground, soft: theme.muted, dim: theme.muted, faint: theme.border, line: theme.border,
        cyan: theme.accent, amber: theme.warning, violet: theme.accent, danger: theme.error, vignette: theme.foreground + '0d' };
    const nativeCss = ':root{color-scheme:' + scheme + ';' + Object.entries(native).map(([name, value]) => `--viz-${name}:${value}`).join(';') + '}';
    await writeFile(path.join(assets, 'code-theme.css'), fontCss + ':root{color-scheme:' + scheme + ';' + Object.entries(variables).map(([name, value]) => `--${name}:${value}`).join(';') + '}\n');
    await writeFile(path.join(assets, 'code-theme.js'), 'window.NotaleCodeTheme=' + JSON.stringify({ palette: theme, monaco, nativeCss }) + ';\n');
}
//# sourceMappingURL=code-theme.js.map