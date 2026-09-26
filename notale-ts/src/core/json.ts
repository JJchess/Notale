import { decodeText } from './text.js';
const pythonTuples = new WeakSet<object>();
export function rememberPythonTuple<T extends unknown[]>(value: T): T { pythonTuples.add(value); return value; }
export function isPythonTuple(value: unknown): value is unknown[] { return Array.isArray(value) && pythonTuples.has(value); }
const yamlDates = new WeakMap<Date, { type: string; iso: string }>();
/** Preserve YAML datetime spelling that JS Date loses (offset and microseconds). */
export function rememberYamlDate(value: Date, source: string): void {
  // Python regex $ also matches immediately before a final LF.
  if (source.endsWith("\n")) source = source.slice(0, -1);
  const date = source.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  const timestamp = source.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[Tt]|[ \t]+)(\d{1,2}):(\d{2}):(\d{2})(?:\.(\d*))?(?:[ \t]*(Z|([-+])(\d{1,2})(?::(\d{2}))?))?$/);
  const match = date ?? timestamp;
  if (!match) return;
  const [, year, month, day, hour, minute, second, fraction, zone, sign, zoneHour, zoneMinute] = match;
  const fail = (message: string): never => { throw Object.assign(new Error(message), { name: 'ValueError' }); };
  const offset = (Number(zoneHour ?? 0) * 60 + Number(zoneMinute ?? 0)) * (sign === '-' ? -1 : 1);
  // Python constructs timezone before datetime, so an invalid offset wins.
  if (Math.abs(offset) >= 1440) {
    const seconds = offset * 60, days = Math.floor(seconds / 86400), remainder = seconds - days * 86400;
    const parts = [...(days ? [`days=${days}`] : []), ...(remainder ? [`seconds=${remainder}`] : [])];
    fail(`offset must be a timedelta strictly between -timedelta(hours=24) and timedelta(hours=24), not datetime.timedelta(${parts.join(', ')}).`);
  }
  const y = Number(year), m = Number(month), d = Number(day);
  if (y < 1 || y > 9999) fail(`year ${y} is out of range`);
  if (m < 1 || m > 12) fail('month must be in 1..12');
  const days = [31, 28 + Number(y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0)), 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (d < 1 || d > days[m - 1]!) fail('day is out of range for month');
  if (Number(hour ?? 0) > 23) fail('hour must be in 0..23');
  if (Number(minute ?? 0) > 59) fail('minute must be in 0..59');
  if (Number(second ?? 0) > 59) fail('second must be in 0..59');
  const micros = (fraction ?? '').slice(0, 6).padEnd(6, '0');
  const absoluteOffset = Math.abs(offset);
  const timezone = !zone ? '' : offset === 0 ? '+00:00' : (offset < 0 ? '-' : '+') + String(Math.floor(absoluteOffset / 60)).padStart(2, '0') + ':' + String(absoluteOffset % 60).padStart(2, '0');
  const dateText = `${year}-${month!.padStart(2, '0')}-${day!.padStart(2, '0')}`;
  const iso = date ? dateText : dateText + `T${hour!.padStart(2, '0')}:${minute}:${second}` + (Number(micros) ? '.' + micros : '') + timezone;
  yamlDates.set(value, { type: date ? 'datetime.date' : 'datetime.datetime', iso });
  const canonical = new Date(0);
  canonical.setUTCFullYear(y, m - 1, d);
  canonical.setUTCHours(Number(hour ?? 0), Number(minute ?? 0), Number(second ?? 0), Math.floor(Number(micros) / 1000));
  value.setTime(canonical.getTime() - offset * 60_000);
}
export function constructYamlTimestamp(source: string): Date {
  const value = new Date(0);
  rememberYamlDate(value, source);
  if (!yamlDates.has(value)) throw Object.assign(new Error("'NoneType' object has no attribute 'groupdict'"), { name: 'AttributeError' });
  return value;
}
export function pythonDateIso(value: Date): string {
  return yamlDates.get(value)?.iso ?? value.toISOString().replace(/\.000Z$/, '+00:00').replace(/(\.\d{3})Z$/, '$1000+00:00');
}
export function pythonObjectType(value: object): string | undefined {
  if (value instanceof Date) return yamlDates.get(value)?.type ?? 'datetime.datetime';
  if (value instanceof Uint8Array) return 'bytes';
  if (value instanceof Set) return 'set';
  return undefined;
}
export type PythonInt = number | bigint;
export function sumIntegers(...values: PythonInt[]): PythonInt {
  return values.reduce<PythonInt>((sum, value) => {
    if (typeof sum === 'bigint' || typeof value === 'bigint') return BigInt(sum) + BigInt(value);
    const result = sum + value;
    return Number.isSafeInteger(result) ? result : BigInt(sum) + BigInt(value);
  }, 0);
}
/** Python truth testing for values originating in JSON. */
export function pythonJsonTruthy(value: unknown): boolean {
  if (value === null || value === undefined || value === false || value === '' || value === 0) return false;
  if (Array.isArray(value)) return value.length > 0;
  if (value instanceof Map) return value.size > 0;
  if (typeof value === 'object') return Object.keys(value).length > 0;
  return true;
}
const MAX_INTEGER_DIGITS = 4300; // Frozen Python baseline default.
function checkIntegerDigits(digits: number): void {
  if (digits > MAX_INTEGER_DIGITS) throw Object.assign(new Error(`Exceeds the limit (${MAX_INTEGER_DIGITS} digits) for integer string conversion: value has ${digits} digits; use sys.set_int_max_str_digits() to increase the limit`), { name: 'ValueError' });
}
/** int() conversion for JSON scalar values, used by provider usage counters. */
export function pythonInteger(value: unknown): number;
export function pythonInteger(value: unknown, exact: true): number | bigint;
export function pythonInteger(value: unknown, exact = false): number | bigint {
  if (typeof value === 'boolean') return Number(value);
  if (typeof value === 'number') {
    if (Number.isNaN(value)) throw Object.assign(new Error('cannot convert float NaN to integer'), { name: 'ValueError' });
    if (!Number.isFinite(value)) throw Object.assign(new Error('cannot convert float infinity to integer'), { name: 'OverflowError' });
    const integer = Math.trunc(value) || 0;
    return exact && !Number.isSafeInteger(integer) ? BigInt(integer) : integer;
  }
  if (typeof value === 'string') {
    const stripped = value.replace(/^[\t-\r \x85\p{Z}]+|[\t-\r \x85\p{Z}]+$/gu, '');
    if (/^[+-]?\p{Nd}+(?:_\p{Nd}+)*$/u.test(stripped)) {
      const ascii = [...stripped].map(char => {
        if (!/\p{Nd}/u.test(char)) return char;
        const code = char.codePointAt(0)!; let first = code;
        while (first > 0 && /\p{Nd}/u.test(String.fromCodePoint(first - 1))) first--;
        return String((code - first) % 10);
      }).join('').replaceAll('_', '');
      checkIntegerDigits(ascii.replace(/^[+-]/, '').length);
      const integer = Number(ascii) || 0;
      return exact && !Number.isSafeInteger(integer) ? BigInt(ascii) : integer;
    }
    const quote = value.includes("'") && !value.includes('"') ? '"' : "'";
    const escaped = [...value].map(char => {
      if (char === '\\' || char === quote) return '\\' + char;
      if (char === '\n') return '\\n'; if (char === '\r') return '\\r'; if (char === '\t') return '\\t';
      if (char !== ' ' && /[\p{C}\p{Z}]/u.test(char)) { const n = char.codePointAt(0)!; return '\\' + (n <= 255 ? 'x' : n <= 65535 ? 'u' : 'U') + n.toString(16).padStart(n <= 255 ? 2 : n <= 65535 ? 4 : 8, '0'); }
      return char;
    }).join('');
    throw Object.assign(new Error('invalid literal for int() with base 10: ' + [...(quote + escaped + quote)].slice(0, 200).join('')), { name: 'ValueError' });
  }
  const name = value == null ? 'NoneType' : Array.isArray(value) ? 'list' : 'dict';
  throw new TypeError("int() argument must be a string, a bytes-like object or a real number, not '" + name + "'");
}
/** Python json.dumps(..., ensure_ascii=False) separators, without changing quoted content. */
export function jsonText(value: unknown, options: { ensureAscii?: boolean; compact?: boolean; allowNan?: boolean; nonFiniteAsNull?: boolean; indent?: number; sdkDatetime?: boolean } = {}): string {
  const active = new Set<object>();
  const unit = options.indent === undefined ? undefined : ' '.repeat(Math.max(0, options.indent));
  const container = (items: string[], open: string, close: string, depth: number): string => {
    if (!items.length) return open + close;
    if (unit !== undefined) return open + '\n' + unit.repeat(depth + 1) + items.join(',\n' + unit.repeat(depth + 1)) + '\n' + unit.repeat(depth) + close;
    return open + items.join(options.compact ? ',' : ', ') + close;
  };
  const serialize = (input: unknown, floating = false, depth = 0, integer?: string): string | undefined => {
    if (typeof input === 'bigint') { const text = input.toString(); checkIntegerDigits(text.replace(/^-/, '').length); return text; }
    if (integer !== undefined && typeof input === 'number' && Object.is(Number(integer), input)) return integer;
    if (typeof input === 'number' && !Number.isFinite(input)) {
      if (options.nonFiniteAsNull) return 'null';
      if (options.allowNan === false) throw Object.assign(new Error('Out of range float values are not JSON compliant: ' + (Number.isNaN(input) ? 'nan' : input > 0 ? 'inf' : '-inf')), { name: 'ValueError' });
      return Number.isNaN(input) ? 'NaN' : input > 0 ? 'Infinity' : '-Infinity';
    }
    if (typeof input === 'number' && (floating || !Number.isInteger(input))) return floatText(input);
    if (input === null || typeof input !== 'object') return JSON.stringify(input);
    const specialType = pythonObjectType(input);
    if (specialType) {
      if (specialType === 'datetime.datetime' && options.sdkDatetime && input instanceof Date) {
        return JSON.stringify(pythonDateIso(input));
      }
      throw new TypeError(`Object of type ${specialType.split('.').at(-1)} is not JSON serializable`);
    }
    if (active.has(input)) throw Object.assign(new Error('Circular reference detected'), { name: 'ValueError' });
    active.add(input);
    try {
      if (Array.isArray(input)) return container(Array.from(input, (item, index) => serialize(item, floatFields.get(input)?.has(String(index)), depth + 1, integerFields.get(input)?.get(String(index))) ?? 'null'), '[', ']', depth);
      if (input instanceof Map) {
        const entries = [...input].flatMap(([key, item]) => {
          const source = mapSources.get(input)?.get(key);
          const integer = source?.value && /^-?(?:0|[1-9]\d*)$/.test(source.value) ? source.value : undefined;
          let name: string;
          if (typeof key === 'string') name = key;
          else if (key === null) name = 'null';
          else if (['number', 'bigint', 'boolean'].includes(typeof key)) name = serialize(key, !!source?.key && /[.eE]/.test(source.key))!;
          else throw new TypeError(`keys must be str, int, float, bool or None, not ${Array.isArray(key) ? 'list' : pythonObjectType(key) ?? 'dict'}`);
          const encoded = serialize(item, !!source?.value && /[.eE]/.test(source.value), depth + 1, integer);
          if (encoded === undefined) return [];
          return [JSON.stringify(name) + (options.compact ? ':' : ': ') + encoded];
        });
        return container(entries, '{', '}', depth);
      }
      const keys = pythonObjectKeys(input);
      const entries = keys.filter(key => Object.prototype.propertyIsEnumerable.call(input, key)).flatMap(key => {
        const encoded = serialize((input as Record<string, unknown>)[key], floatFields.get(input)?.has(key), depth + 1, integerFields.get(input)?.get(key));
        return encoded === undefined ? [] : [JSON.stringify(key) + (options.compact ? ':' : ': ') + encoded];
      });
      return container(entries, '{', '}', depth);
    } finally { active.delete(input); }
  };
  const result = serialize(value);
  if (result === undefined) throw new TypeError('JSON value is not serializable');
  return options.ensureAscii ? result.replace(/[^\x00-\x7e]/g, char => '\\u' + char.charCodeAt(0).toString(16).padStart(4, '0')) : result;
}

function floatText(value: number): string {
  if (Object.is(value, -0)) return '-0.0';
  const [mantissa, exponentText] = value.toExponential().split('e');
  const exponent = Number(exponentText);
  if (exponent < -4 || exponent >= 16) return mantissa + 'e' + (exponent < 0 ? '-' : '+') + String(Math.abs(exponent)).padStart(2, '0');
  return String(value) + (Number.isInteger(value) ? '.0' : '');
}

const mapSources = new WeakMap<Map<any, any>, Map<any, { key: string | undefined; value: string | undefined }>>();
const setSources = new WeakMap<Set<any>, Map<any, string>>();
export function rememberSetNumber(target: Set<any>, value: any, source: string): void {
  let sources = setSources.get(target);
  if (!sources) setSources.set(target, sources = new Map());
  if (!sources.has(value)) sources.set(value, source);
}
export function setNumberSource(target: Set<any>, value: any): string | undefined {
  return setSources.get(target)?.get(value);
}
export function rememberMapSources(target: Map<any, any>, key: any, keySource?: string, valueSource?: string): void {
  let sources = mapSources.get(target);
  if (!sources) mapSources.set(target, sources = new (target.constructor as typeof Map)());
  sources.set(key, { key: sources.has(key) ? sources.get(key)!.key : keySource, value: valueSource });
}
/** Numeric spelling of a YAML mapping key, retained when iterating that key. */
export function mappingKeyNumberSource(source: Map<any, any>, key: any): string | undefined {
  return mapSources.get(source)?.get(key)?.key;
}
/** Python dict(mapping) is a shallow copy, including numeric spelling metadata. */
export function copyJsonMapping(source: Map<any, any>): Map<any, any> {
  const result = new (source.constructor as typeof Map)(source);
  for (const key of source.keys()) {
    const metadata = mapSources.get(source)?.get(key);
    if (metadata) rememberMapSources(result, key, metadata.key, metadata.value);
  }
  return result;
}
/** Python dict update preserves typed keys until JSON serialization. */
export function mergeJsonMappings(left: Record<string, any>, right: Record<string, any>): Record<string, any> | Map<any, any> {
  if (!(left instanceof Map) && !(right instanceof Map)) {
    const result = { ...left, ...right };
    for (const key of Object.keys(result)) {
      const source = Object.hasOwn(right, key) ? right : left;
      const spelling = integerFields.get(source)?.get(key) ?? (floatFields.get(source)?.has(key) ? '0.0' : '');
      rememberNumber(result, key, result[key], spelling);
    }
    rememberKeyOrder(result, [...pythonObjectKeys(left), ...pythonObjectKeys(right)]);
    return result;
  }
  const mapping = left instanceof Map && left.constructor !== Map ? left : right instanceof Map ? right : left;
  const result = new (mapping.constructor as typeof Map)();
  for (const source of [left, right]) {
    const entries = source instanceof Map ? source : pythonObjectKeys(source).map(key => [key, source[key]] as const);
    for (const [key, value] of entries) {
      result.set(key, value);
      const metadata = source instanceof Map ? mapSources.get(source)?.get(key) : undefined;
      const numberSource = source instanceof Map ? metadata?.value : integerFields.get(source)?.get(key) ?? (floatFields.get(source)?.has(key) ? '0.0' : undefined);
      rememberMapSources(result, key, metadata?.key, numberSource);
    }
  }
  return result;
}

// Keep JSON integer/float provenance without changing values or enumerable tool fields.
const keyOrder = new WeakMap<object, Set<string>>();
export function rememberKeyOrder(target: object, keys: Iterable<string>): void { keyOrder.set(target, new Set(keys)); }
export function pythonObjectKeys(target: object): string[] {
  const recorded = keyOrder.get(target);
  const keys = recorded ? [...recorded, ...Object.keys(target).filter(key => !recorded.has(key))] : Object.keys(target);
  return keys.filter(key => Object.prototype.propertyIsEnumerable.call(target, key));
}
const floatFields = new WeakMap<object, Set<string>>();
const integerFields = new WeakMap<object, Map<string, string>>();
export function rememberNumber(target: object, key: string, value: unknown, source: string): void {
  const floats = floatFields.get(target) ?? new Set<string>();
  const integers = integerFields.get(target) ?? new Map<string, string>();
  if (typeof value === 'number' && /[.eE]/.test(source)) floats.add(key); else floats.delete(key);
  if (typeof value === 'number' && !Number.isSafeInteger(value) && /^-?(?:0|[1-9]\d*)$/.test(source)) integers.set(key, source); else integers.delete(key);
  if (floats.size) floatFields.set(target, floats); else floatFields.delete(target);
  if (integers.size) integerFields.set(target, integers); else integerFields.delete(target);
}
/** Preserve JSON number/key provenance when copying existing fields unchanged. */
export function inheritJsonProvenance<T extends object>(target: T, source: object): T {
  const values = source as Record<string, unknown>, copied = target as Record<string, unknown>;
  const floats = floatFields.get(source);
  if (floats) floatFields.set(target, new Set([...floats].filter(key => Object.prototype.hasOwnProperty.call(target, key) && Object.is(values[key], copied[key]))));
  const integers = integerFields.get(source);
  if (integers) integerFields.set(target, new Map([...integers].filter(([key]) => Object.prototype.hasOwnProperty.call(target, key) && Object.is(values[key], copied[key]))));
  const order = keyOrder.get(source);
  if (order) keyOrder.set(target, new Set([...order].filter(key => Object.prototype.hasOwnProperty.call(target, key))));
  return target;
}
export const isPythonIntegerField = (object: Record<string, unknown>, key: string): boolean => {
  const value = object instanceof Map ? object.get(key) : object[key];
  const mapped = object instanceof Map ? mapSources.get(object)?.get(key)?.value : undefined;
  if (mapped !== undefined) return /^-?(?:0|[1-9]\d*)$/.test(mapped);
  const original = integerFields.get(object)?.get(key);
  return !floatFields.get(object)?.has(key) && (Number.isInteger(value) || (original !== undefined && Object.is(Number(original), value)));
};
/** Numeric text with optional source-container provenance (JSON or YAML). */
export function pythonNumberText(value: number, owner?: object, key?: string): string {
  const mapped = owner instanceof Map && key !== undefined ? mapSources.get(owner)?.get(key)?.value : undefined;
  if (mapped !== undefined) return /[.eE]/.test(mapped) ? floatText(value) : mapped;
  const integer = owner && key !== undefined ? integerFields.get(owner)?.get(key) : undefined;
  if (integer !== undefined && Object.is(Number(integer), value)) return integer;
  if (Number.isFinite(value) && owner && key !== undefined && floatFields.get(owner)?.has(key)) return floatText(value);
  return jsonText(value);
}

/** Python json.loads syntax/diagnostics; optional rootValue retains scalar provenance in its value field. */
export function parsePythonJson(text: string, rootValue?: Record<string, unknown>): any {
  let at = 0;
  const fail = (message: string, index = at): never => {
    const before = text.slice(0, index), lines = before.split('\n');
    const position = [...before].length, line = lines.length, column = [...lines.at(-1)!].length + 1;
    throw Object.assign(new Error(`${message}: line ${line} column ${column} (char ${position})`), { name: 'JSONDecodeError', pos: position, lineno: line, colno: column });
  };
  const space = () => { while (/[\t\n\r ]/.test(text[at] ?? '\0')) at++; };
  const string = (): string => {
    const start = at++;
    while (at < text.length) {
      const char = text[at++]!;
      if (char === '"') return JSON.parse(text.slice(start, at));
      if (char.charCodeAt(0) < 32) fail('Invalid control character at', at - 1);
      if (char !== '\\') continue;
      if (at === text.length) break;
      const escape = text[at++]!;
      if (escape === 'u') {
        if (!/^[\da-fA-F]{4}$/.test(text.slice(at, at + 4))) fail('Invalid \\uXXXX escape', at - 1);
        at += 4;
      } else if (!'"\\/bfnrt'.includes(escape)) fail('Invalid \\escape', at - 2);
    }
    return fail('Unterminated string starting at', start);
  };
  const value = (): any => {
    space();
    const char = text[at];
    if (char === '"') return string();
    if (char === '[') {
      at++; space(); const result: unknown[] = [];
      if (text[at] === ']') { at++; return result; }
      for (;;) {
        space(); const start = at, parsed = value();
        rememberNumber(result, String(result.length), parsed, text.slice(start, at));
        result.push(parsed); space();
        if (text[at] === ']') { at++; return result; }
        if (text[at] !== ',') fail("Expecting ',' delimiter");
        at++;
      }
    }
    if (char === '{') {
      at++; space(); const result: Record<string, unknown> = {};
      const keys = new Set<string>(); keyOrder.set(result, keys);
      if (text[at] === '}') { at++; return result; }
      for (;;) {
        space(); if (text[at] !== '"') fail('Expecting property name enclosed in double quotes');
        const key = string(); keys.add(key); space();
        if (text[at] !== ':') fail("Expecting ':' delimiter");
        at++; space();
        const start = at, parsed = value();
        rememberNumber(result, key, parsed, text.slice(start, at));
        Object.defineProperty(result, key, { value: parsed, enumerable: true, configurable: true, writable: true }); space();
        if (text[at] === '}') { at++; return result; }
        if (text[at] !== ',') fail("Expecting ',' delimiter");
        at++;
      }
    }
    for (const [literal, result] of [['true', true], ['false', false], ['null', null], ['NaN', NaN], ['Infinity', Infinity], ['-Infinity', -Infinity]] as const) {
      if (text.startsWith(literal, at)) { at += literal.length; return result; }
    }
    const number = text.slice(at).match(/^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/);
    if (number) {
      const integer = !/[.eE]/.test(number[0]);
      if (integer) checkIntegerDigits(number[0].replace(/^-/, '').length);
      at += number[0].length;
      const parsed = Number(number[0]);
      return integer && parsed === 0 ? 0 : parsed;
    }
    return fail('Expecting value');
  };
  if (text.startsWith('\uFEFF')) fail('Unexpected UTF-8 BOM (decode using utf-8-sig)');
  space(); const start = at, result = value(), end = at;
  space(); if (at !== text.length) fail('Extra data');
  if (rootValue) { rootValue.value = result; rememberNumber(rootValue, 'value', result, text.slice(start, end)); }
  return result;
}

/** json.loads(bytes): BOM/zero-byte detection and surrogatepass decoding. */
export function parsePythonJsonBytes(bytes: Buffer, rootValue?: Record<string, unknown>): any {
  const starts = (hex: string) => bytes.subarray(0, hex.length / 2).equals(Buffer.from(hex, 'hex'));
  let width = 1, little = false, offset = 0;
  if (starts('0000feff') || starts('fffe0000')) { width = 4; little = starts('fffe0000'); offset = 4; }
  else if (starts('feff') || starts('fffe')) { width = 2; little = starts('fffe'); offset = 2; }
  else if (starts('efbbbf')) offset = 3;
  else if (bytes.length >= 4) {
    if (!bytes[0]) width = bytes[1] ? 2 : 4;
    else if (!bytes[1]) { width = bytes[2] || bytes[3] ? 2 : 4; little = true; }
  } else if (bytes.length === 2) {
    if (!bytes[0]) width = 2;
    else if (!bytes[1]) { width = 2; little = true; }
  }
  if (width === 1) return parsePythonJson(decodeText(bytes.subarray(offset), true, { surrogatePass: true, universalNewlines: false }), rootValue);
  const encoding = `utf-${width * 8}-${little ? 'le' : 'be'}`;
  const fail = (start: number, end: number, reason: string): never => {
    const location = end === start + 1 ? `byte 0x${bytes[start]!.toString(16).padStart(2, '0')} in position ${start}` : `bytes in position ${start}-${end - 1}`;
    throw Object.assign(new Error(`'${encoding}' codec can't decode ${location}: ${reason}`), { name: 'UnicodeDecodeError', encoding, start, end, reason });
  };
  let text = '';
  for (let at = offset; at < bytes.length; at += width) {
    if (at + width > bytes.length) fail(at, bytes.length, 'truncated data');
    const code = width === 2 ? (little ? bytes.readUInt16LE(at) : bytes.readUInt16BE(at)) : (little ? bytes.readUInt32LE(at) : bytes.readUInt32BE(at));
    if (code > 0x10ffff) fail(at, at + width, 'code point not in range(0x110000)');
    text += String.fromCodePoint(code);
  }
  return parsePythonJson(text, rootValue);
}
