/** Instance-local cookie state matching httpx's default Netscape cookie policy. */
import { pythonInteger } from '../../core/json.js';

interface Cookie {
  name: string; value: string | null; domain: string; path: string;
  secure: boolean; expires: number | null; port: string | null;
}
const effectiveHost = (url: URL) => url.hostname.includes('.') ? url.hostname : url.hostname + '.local';
const escapePath = (path: string) => Array.from(path, char => /[a-zA-Z0-9_.~!$&'()*+,\-/:=@%]/.test(char) ? char : encodeURIComponent(char)).join('').replace(/%[\da-f]{2}/gi, value => value.toUpperCase());
const requestPort = (url: URL) => url.port || '80'; // urllib's absent-port default, including HTTPS.
const unquote = (value: string) => value.startsWith('"') && value.endsWith('"') ? value.slice(1, -1) : value;

// http.cookiejar.http2time accepts HTTP dates, not JavaScript's broader date grammar.
function cookieTime(text: string): number | null {
  const months = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
  const strict = /^[SMTWF][a-z][a-z], (\d\d) ([JFMASOND][a-z][a-z]) (\d{4}) (\d\d):(\d\d):(\d\d) GMT$/.exec(text);
  const cleaned = text.trimStart().replace(/^(?:Sun|Mon|Tue|Wed|Thu|Fri|Sat)[a-z]*,?[\t\n\v\f\r ]*/, '');
  const loose = strict ? null : /^(\d\d?)(?:[\t\n\v\f\r ]+|[-/])(\w+)(?:[\t\n\v\f\r ]+|[-/])(\d+)(?:(?:[\t\n\v\f\r ]+|:)(\d\d?):(\d\d)(?::(\d\d))?)?[\t\n\v\f\r ]*(?:([-+]?\d{2,4}|(?![APap][Mm]\b)[A-Za-z]+)[\t\n\v\f\r ]*)?(?:\(\w+\)[\t\n\v\f\r ]*)?$/.exec(cleaned);
  const match = strict ?? loose;
  if (!match) return null;
  let year = Number(match[3]);
  if (year > 9999) return null;
  if (!strict && year < 1000) {
    const current = new Date().getFullYear(), difference = current % 100 - year;
    year += current - current % 100;
    if (Math.abs(difference) > 50) year += difference > 0 ? 100 : -100;
  }
  const namedMonth = months.indexOf(match[2]!.toLowerCase());
  if (strict && namedMonth < 0) throw new Error('invalid strict HTTP date month');
  const month = namedMonth >= 0 ? namedMonth + 1 : /^\d+$/.test(match[2]!) ? Number(match[2]) : 0;
  const day = Number(match[1]), hour = Number(match[4] ?? 0), minute = Number(match[5] ?? 0), second = Number(match[6] ?? 0);
  if (year < 1970 || month < 1 || month > 12 || day < 1 || day > 31 || hour > 24 || minute > 59 || second > 61) return null;
  const zone = strict ? 'GMT' : (match[7] ?? 'UTC').toUpperCase();
  let offset = 0;
  if (!['GMT', 'UTC', 'UT', 'Z'].includes(zone)) {
    const numeric = /^([-+])?(\d\d?):?(\d\d)?$/.exec(zone);
    if (!numeric) return null;
    offset = (Number(numeric[2]) * 3600 + Number(numeric[3] ?? 0) * 60) * (numeric[1] === '-' ? -1 : 1);
  }
  return Date.UTC(year, month - 1, day, hour, minute, second) / 1000 - offset;
}

type CookiePairs = [string, string | null][];
function headerWords(text: string): CookiePairs[] {
  const result: CookiePairs[] = [];
  let pairs: CookiePairs = [];
  while (text) {
    const token = /^\s*([^=\s;,]+)/.exec(text);
    if (token) {
      text = text.slice(token[0].length);
      const quoted = /^\s*=\s*"([^"\\]*(?:\\.[^"\\]*)*)"/.exec(text);
      const plain = quoted ? null : /^\s*=\s*([^\s;,]*)/.exec(text);
      const value = quoted ? quoted[1]!.replace(/\\(.)/g, '$1') : plain ? plain[1]!.trimEnd() : null;
      text = text.slice((quoted ?? plain)?.[0].length ?? 0);
      pairs.push([token[1]!, value]);
    } else if (text.trimStart().startsWith(',')) {
      text = text.trimStart().slice(1);
      if (pairs.length) result.push(pairs);
      pairs = [];
    } else {
      const rest = text.replace(/^[=\s;]*/, '');
      if (rest === text) break;
      text = rest;
    }
  }
  if (pairs.length) result.push(pairs);
  return result;
}

interface NormalizedCookie {
  name: string; value: string | null; attrs: Map<string, string | null>; expires: number | string | null;
}
function normalizeCookies(inputs: CookiePairs[], legacy: boolean, now: number): NormalizedCookie[] {
  // Parse every header before normalizing any attributes. A malformed strict
  // date aborts this header family even if an earlier attribute rejects it.
  const parsed = inputs.filter(pairs => pairs[0]?.[0]).map(pairs => ({
    name: pairs[0]![0], value: pairs[0]![1],
    attrs: pairs.slice(1).map(([key, value]): [string, string | number | null] => {
      key = key.toLowerCase();
      if (!legacy && value !== null) {
        if (key === 'expires') return [key, cookieTime(unquote(value))];
        if (key === 'version') value = unquote(value);
      }
      return [key, value];
    }),
  }));
  const result: NormalizedCookie[] = [];
  for (const parsedCookie of parsed) {
    const attrs = new Map<string, string | null>();
    let expires: number | string | null = null, maxAge = false, rejected = false;
    for (let [key, value] of parsedCookie.attrs) {
      if (attrs.has(key)) continue;
      if (key === 'expires') {
        if (maxAge || value === null) continue;
        expires = value;
      } else if (key === 'max-age') {
        // Python catches ValueError here, but TypeError aborts the family.
        try { expires = Number(BigInt(now) + BigInt(pythonInteger(value, true))); }
        catch (error) {
          if (!(error instanceof Error) || error.name !== 'ValueError') throw error;
          rejected = true; break;
        }
        maxAge = true; key = 'expires';
      } else if (value === null && ['version', 'domain', 'path'].includes(key)) {
        rejected = true; break;
      }
      attrs.set(key, value === null ? null : String(value));
    }
    if (!rejected) result.push({ name: parsedCookie.name, value: parsedCookie.value, attrs, expires });
  }
  return result;
}

export class ModelCookies {
  // Nested insertion order is significant for equal-length cookie paths.
  private readonly domains = new Map<string, Map<string, Map<string, Cookie>>>();

  extract(urlText: string, headers: Headers): void {
    const url = new URL(urlText), host = effectiveHost(url), now = Math.floor(Date.now() / 1000);
    const ordinary = headers.getSetCookie();
    // Default CookieJar ignores Set-Cookie2-only responses, but parses it when
    // Netscape headers are also present, before the ordinary cookie batch.
    if (!ordinary.length) return;
    const pending: Cookie[] = [];
    for (const legacy of [true, false]) {
      const accepted: Cookie[] = [];
      try {
        const inputs = legacy ? headerWords(headers.get('set-cookie2') ?? '') : ordinary.map(header => header.split(';').map((part): [string, string | null] => {
          const at = part.indexOf('=');
          return [(at < 0 ? part : part.slice(0, at)).trim(), at < 0 ? null : part.slice(at + 1).trim()];
        }));
        const normalized = normalizeCookies(inputs, legacy, now);
        for (const { name, value, attrs, expires } of normalized) {
          let version: number | null = legacy ? null : 0;
          try { if (attrs.has('version')) version = pythonInteger(unquote(attrs.get('version') ?? '')); }
          catch { continue; }
          if (['domain', 'path'].some(key => attrs.has(key) && attrs.get(key) === null)) continue;
          let path = attrs.get('path');
          if (!path) {
            const source = escapePath(url.pathname);
            path = source.slice(0, source.lastIndexOf('/') + (version === 0 ? 0 : 1)) || '/';
          } else path = escapePath(path);
          const suppliedDomain = attrs.get('domain');
          const domain = suppliedDomain === undefined ? host : (suppliedDomain!.startsWith('.') ? suppliedDomain! : '.' + suppliedDomain!).toLowerCase();
          if (typeof expires === 'string') throw new TypeError('Cookie Expires is not numeric');
          if (expires !== null && expires <= now) {
            this.domains.get(domain)?.get(path)?.delete(name);
            continue;
          }
          if (expires !== null && !Number.isFinite(expires)) throw new RangeError('Cookie expiry overflows float conversion');
          // Expiration is processed before acceptance, even for rejected versions.
          if (version === null || version > (legacy ? 0 : 1)) continue;
          if (suppliedDomain !== undefined) {
            const bare = domain.slice(1);
            if (!bare.includes('.') && !host.endsWith('.local')) continue;
            if (!host.endsWith(domain) && !host.endsWith(bare + '.local') && !('.' + host).endsWith(domain)) continue;
          }
          let port: string | null = null;
          if (attrs.has('port')) {
            port = attrs.get('port') === null ? requestPort(url) : attrs.get('port')!.replace(/\s+/g, '');
            if (attrs.get('port') !== null) {
              let matches = false;
              for (const candidate of port.split(',')) {
                try { pythonInteger(candidate); } catch { break; }
                if (candidate === requestPort(url)) { matches = true; break; }
              }
              if (!matches) continue;
            }
          }
          const cookie: Cookie = { name, value, domain, path, secure: attrs.has('secure') && attrs.get('secure') !== '', expires, port };
          accepted.push(cookie);
        }
      } catch {
        // CookieJar discards newly constructed cookies from this family;
        // deletions already applied during construction remain in effect.
        continue;
      }
      pending.push(...accepted);
    }
    // CookieJar parses the full response (including deletions) before storing
    // accepted new cookies. A later deletion cannot erase a pending cookie.
    for (const cookie of pending) {
      const { domain, path, name } = cookie;
      let paths = this.domains.get(domain);
      if (!paths) this.domains.set(domain, paths = new Map());
      let names = paths.get(path);
      if (!names) paths.set(path, names = new Map());
      names.set(name, cookie);
    }
  }

  header(urlText: string): string | undefined {
    const url = new URL(urlText), host = effectiveHost(url), path = escapePath(url.pathname), now = Math.floor(Date.now() / 1000);
    const cookies: Cookie[] = [];
    for (const [domain, paths] of this.domains) for (const names of paths.values()) for (const cookie of names.values()) {
      if (cookie.expires !== null && cookie.expires <= now) { names.delete(cookie.name); continue; }
      if (!('.' + host).endsWith(domain.startsWith('.') ? domain : '.' + domain)) continue;
      if (path !== cookie.path && !(path.startsWith(cookie.path) && (cookie.path.endsWith('/') || path[cookie.path.length] === '/'))) continue;
      if (cookie.secure && url.protocol !== 'https:' && url.protocol !== 'wss:') continue;
      if (cookie.port && !cookie.port.split(',').includes(requestPort(url))) continue;
      cookies.push(cookie);
    }
    cookies.sort((a, b) => b.path.length - a.path.length);
    return cookies.length ? cookies.map(cookie => cookie.value === null ? cookie.name : cookie.name + '=' + cookie.value).join('; ') : undefined;
  }
}
