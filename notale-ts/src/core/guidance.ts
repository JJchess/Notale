/** Deterministic port of notale-v2/core/skills.py. No model calls or Python runtime. */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { decodeText } from './text.js';
import { fileURLToPath } from 'node:url';
import { parseDocument, Lexer, Parser, Composer, visit, isAlias, isMap, isSeq, isScalar, Scalar, Pair, YAMLMap, YAMLSeq, type ScalarTag, type Document } from 'yaml';
import { rememberNumber, rememberKeyOrder, pythonObjectKeys, rememberMapSources, rememberSetNumber, rememberYamlDate, constructYamlTimestamp, pythonInteger, pythonDateIso, pythonObjectType, rememberPythonTuple, isPythonTuple, pythonNumberText, isPythonIntegerField } from './json.js';

export const RESOURCES = fileURLToPath(new URL('../../resources/', import.meta.url));
export const WORKFLOWS = path.join(RESOURCES, 'skills');
export const PROMPTS = path.join(RESOURCES, 'prompts');
export const PAGE_WORKFLOWS = ['build-cover', 'build-page', 'build-interaction', 'build-code'] as const;
export const FONT_SCALE = { h1: 40, h2: 30, lead: 26, body: 24, sec: 24, label: 20, tick: 18 } as const;
export const FONT_FLOOR = `按 1600×900 逻辑画布：普通页标题默认 ${FONT_SCALE.h1}px（主题可选 36–44px）；正文与成句说明 ≥${FONT_SCALE.body}px，控件标签、图例、图注和提示 ≥${FONT_SCALE.label}px，纯数字刻度 ≥${FONT_SCALE.tick}px，多行文字行高 ≥1.35。数学上下标按相对比例；模板固定文字、原始图片与独立代码工作台不套此字号要求。不得缩放整个内容组绕过阅读尺度。`;
export const FONT_TOKENS = Object.entries(FONT_SCALE).map(([role, size]) => `--fs-${role}: ${size}px`).join('; ');
const read = (file: string, strict = false) => decodeText(readFileSync(file), strict);
const mergedKeyOrders = new WeakMap<object, string[]>();

/** Merge existing alias objects without reconverting their anchored children. */
function preserveMergeAliases(node: Scalar): Scalar {
  const original = node.addToJSMap!;
  node.addToJSMap = (ctx, target, value) => {
    if (!ctx) return original(ctx, target, value);
    const source = isAlias(value) ? value.resolve(ctx.doc) : value;
    const items = isSeq(source) ? source.items : [value];
    const merged = new TypedYamlMap();
    for (const item of [...items].reverse()) {
      let resolved;
      if (isAlias(item) && isMap(item.resolve(ctx.doc))) resolved = item.toJSON(null, ctx);
      else { resolved = new TypedYamlMap(); original(ctx, resolved, item); }
      const record = resolved as Record<string, unknown>;
      const keys = resolved instanceof Map ? [] : [...new Set([...(mergedKeyOrders.get(record) ?? []), ...pythonObjectKeys(record)])].filter(key => Object.hasOwn(record, key));
      const entries = resolved instanceof Map ? resolved.entries() : keys.map(key => [key, record[key]] as const);
      for (const [key, value] of entries) merged.set(key, value);
    }
    for (const [key, value] of merged) {
      if (target instanceof Map) { if (!target.has(key)) target.set(key, value); }
      else if (target instanceof Set) target.add(key);
      else if (!Object.hasOwn(target, key)) Object.defineProperty(target, key, { value, writable: true, enumerable: true, configurable: true });
    }
    if (!(target instanceof Map) && !(target instanceof Set)) mergedKeyOrders.set(target, [...merged.keys()].map(String));
  };
  return node;
}

// Python mapping equality identifies boolean and integral numeric keys, while
// keeping them distinct from strings and retaining the first key's identity.
export function tupleKeyItems(tuple: any[]): any[] {
  return tuple.map((value, index) => typeof value === 'number' && isPythonIntegerField(tuple as any, String(index))
    ? BigInt(pythonNumberText(value, tuple, String(index))) : value);
}
export function pythonKeysEqual(left: any, right: any): boolean {
  const identity = (value: any): any => typeof value === 'boolean' ? BigInt(Number(value)) : typeof value === 'number' && Number.isFinite(value) && Number.isInteger(value) ? BigInt(value) : value;
  if (Object.is(identity(left), identity(right))) return true;
  if (isPythonTuple(left) && isPythonTuple(right)) {
    const a = tupleKeyItems(left), b = tupleKeyItems(right);
    return a.length === b.length && a.every((value, index) => pythonKeysEqual(value, b[index]));
  }
  if (left instanceof Uint8Array && right instanceof Uint8Array) return left.length === right.length && left.every((byte, index) => byte === right[index]);
  if (left instanceof Date && right instanceof Date && pythonObjectType(left) === pythonObjectType(right)) {
    const a = pythonDateIso(left), b = pythonDateIso(right);
    if (a === b) return true;
    if (/[+-]\d{2}:\d{2}$/.test(a) && /[+-]\d{2}:\d{2}$/.test(b)) {
      const micros = (iso: string) => Number((iso.match(/\.(\d+)/)?.[1] ?? '').padEnd(6, '0').slice(3));
      return left.getTime() === right.getTime() && micros(a) === micros(b);
    }
  }
  return false;
}
const negativeZeroMaps = new WeakSet<Map<any, any>>();
export class TypedYamlMap extends Map<any, any> {
  private matching(key: any): any {
    for (const existing of super.keys()) if (pythonKeysEqual(existing, key)) return existing;
    return key;
  }
  override has(key: any): boolean { return super.has(this.matching(key)); }
  override get(key: any): any { return super.get(this.matching(key)); }
  override set(key: any, value: any): this {
    const matched = this.matching(key);
    if (!super.has(matched) && Object.is(key, -0)) negativeZeroMaps.add(this);
    return super.set(matched, value);
  }
  override delete(key: any): boolean {
    const matched = this.matching(key), deleted = super.delete(matched);
    if (deleted && matched === 0) negativeZeroMaps.delete(this);
    return deleted;
  }
  override clear(): void { negativeZeroMaps.delete(this); super.clear(); }
  override *keys(): MapIterator<any> {
    for (const key of super.keys()) yield key === 0 && negativeZeroMaps.has(this) ? -0 : key;
  }
  override *entries(): MapIterator<[any, any]> {
    for (const [key, value] of super.entries()) yield [key === 0 && negativeZeroMaps.has(this) ? -0 : key, value];
  }
  override [Symbol.iterator](): MapIterator<[any, any]> { return this.entries(); }
  override forEach(callback: (value: any, key: any, map: Map<any, any>) => void, thisArg?: any): void {
    for (const [key, value] of this.entries()) callback.call(thisArg, value, key, this);
  }
}
const negativeZeroSets = new WeakSet<Set<any>>();
export class TypedYamlSet extends Set<any> {
  private matching(key: any): any {
    for (const existing of super.values()) if (pythonKeysEqual(existing, key)) return existing;
    return key;
  }
  override has(key: any): boolean { return super.has(this.matching(key)); }
  override add(key: any): this {
    const matched = this.matching(key);
    if (!super.has(matched) && Object.is(key, -0)) negativeZeroSets.add(this);
    return super.add(matched);
  }
  override delete(key: any): boolean {
    const matched = this.matching(key), deleted = super.delete(matched);
    if (deleted && matched === 0) negativeZeroSets.delete(this);
    return deleted;
  }
  override clear(): void { negativeZeroSets.delete(this); super.clear(); }
  override *values(): SetIterator<any> {
    for (const value of super.values()) yield value === 0 && negativeZeroSets.has(this) ? -0 : value;
  }
  override keys(): SetIterator<any> { return this.values(); }
  override [Symbol.iterator](): SetIterator<any> { return this.values(); }
  override *entries(): SetIterator<[any, any]> { for (const value of this.values()) yield [value, value]; }
  override forEach(callback: (value: any, value2: any, set: Set<any>) => void, thisArg?: any): void {
    for (const value of this.values()) callback.call(thisArg, value, value, this);
  }
}

export { pythonObjectType as yamlObjectType } from './json.js';

export function parseYaml(source: string): any {
  // SafeLoader requires a decimal point and an explicit exponent sign;
  // signed leading-dot values are strings under its implicit resolver.
  const pythonFloat = /^(?:[-+]?(?:[0-9][0-9_]*)\.[0-9_]*(?:[eE][-+][0-9]+)?|\.[0-9][0-9_]*(?:[eE][-+][0-9]+)?|[-+]?[0-9][0-9_]*(?::[0-5]?[0-9])+\.[0-9_]*|[-+]?\.(?:inf|Inf|INF)|\.(?:nan|NaN|NAN))$/;
  let document: Document.Parsed = parseDocument(source, {
    version: '1.1', schema: 'yaml-1.1', uniqueKeys: false, intAsBigInt: true,
    // PyYAML's SafeLoader follows YAML 1.1 scalar rules but does not treat
    // single-letter y/n as booleans. Preserve that resolver exactly.
    customTags: tags => [...tags.filter(tag => typeof tag === 'string' || tag.tag !== 'tag:yaml.org,2002:bool').map(tag =>
      typeof tag !== 'string' && ['tag:yaml.org,2002:omap', 'tag:yaml.org,2002:pairs', 'tag:yaml.org,2002:set'].includes(tag.tag)
        ? { ...tag, resolve: (sequence: unknown) => sequence }
        : typeof tag !== 'string' && tag.tag === 'tag:yaml.org,2002:merge' && 'test' in tag
        ? { ...(tag as ScalarTag), resolve: (value: string, onError: (message: string) => void, options: any) => preserveMergeAliases((tag as ScalarTag).resolve(value, onError, options) as Scalar) }
        : typeof tag !== 'string' && tag.tag === 'tag:yaml.org,2002:float' && 'test' in tag && tag.test
        ? { ...tag, test: new RegExp('(?=' + pythonFloat.source + ')' + tag.test.source) } : tag), {
      tag: 'tag:yaml.org,2002:bool', default: true,
      test: /^(?:yes|Yes|YES|no|No|NO|true|True|TRUE|false|False|FALSE|on|On|ON|off|Off|OFF)$/,
      resolve: (value: string) => ['yes', 'true', 'on'].includes(value.toLowerCase()),
    }],
  });
  if (document.errors.length && /\*[^\s,{}\[\]]+:/.test(source)) {
    // PyYAML ends an alias before a mapping colon. Preserve byte offsets by
    // splitting the lexeme, rather than inserting whitespace into source.
    const lexer = new Lexer(), parser = new Parser();
    let split = false;
    function* tokens() {
      for (const token of lexer.lex(source)) {
        if (token.startsWith('*') && token.endsWith(':')) {
          split = true;
          yield* parser.next(token.slice(0, -1));
          yield* parser.next(':');
        } else yield* parser.next(token);
      }
      yield* parser.end();
    }
    const documents = [...new Composer({ ...document.options, schema: document.schema }).compose(tokens(), true, source.length)];
    // Keep the original parser diagnostic unless this known lexical correction
    // yields exactly one complete, valid document.
    if (split && documents.length === 1 && !documents[0]!.errors.length) document = documents[0]!;
  }
  if (document.errors.length) throw document.errors[0];
  const constructionError = (context: string | null, container: any, problem: string, node: any): never => {
    const mark = (value: any): string => {
      let offset = value?.range?.[0] ?? 0;
      const properties = source.slice(0, offset).match(/(?:[!&][^\s\[\]{},]+\s+)+$/);
      if (properties) offset -= properties[0].length;
      const chars = Array.from(source), pointer = Array.from(source.slice(0, offset)).length;
      const before = chars.slice(0, pointer).join('').split(/\r\n|[\r\n\x85\u2028\u2029]/);
      let start = pointer, end = pointer, head = '', tail = '';
      const breaks = '\0\r\n\x85\u2028\u2029';
      while (start > 0 && !breaks.includes(chars[start - 1]!)) {
        start--; if (pointer - start > 36.5) { head = ' ... '; start += 5; break; }
      }
      while (end < chars.length && !breaks.includes(chars[end]!)) {
        end++; if (end - pointer > 36.5) { tail = ' ... '; end -= 5; break; }
      }
      return `  in "<unicode string>", line ${before.length}, column ${Array.from(before.at(-1)!).length + 1}:\n    ${head}${chars.slice(start, end).join('')}${tail}\n${' '.repeat(4 + pointer - start + head.length)}^`;
    };
    const prefix = context ? `${context}\n${container === node ? '' : mark(container) + '\n'}` : '';
    throw Object.assign(new Error(`${prefix}${problem}\n${mark(node)}`), { name: 'ConstructorError' });
  };
  const needsTypedKeys = (value: any, seen = new Set<object>()): boolean => {
    if (isAlias(value)) value = value.resolve(document);
    if (!value || typeof value !== 'object' || seen.has(value)) return false;
    seen.add(value);
    if (isSeq(value)) return value.items.some(item => needsTypedKeys(item, seen));
    if (!isMap(value)) return false;
    return value.items.some(pair => {
      const key = isAlias(pair.key) ? pair.key.resolve(document) : pair.key;
      if (isScalar(key) && typeof key.value === 'symbol' && key.value.description === '<<') return needsTypedKeys(pair.value, seen);
      return !isScalar(key) || typeof key.value !== 'string';
    });
  };
  // PyYAML concatenates repeated merge entries, so the last entry wins.
  // A single YAML merge sequence expresses that priority in reverse order.
  // SafeLoader yields each container before constructing its children. Process
  // pending containers in that order, including discarded set values.
  const originalPairs = new WeakMap<YAMLMap, YAMLMap['items']>();
  const flattenedOrder = new WeakMap<YAMLMap, { items: YAMLMap['items'] }>();
  // Mirror SafeLoader's destructive merge expansion on a separate pair list.
  // Keep the actual AST intact so conversion still reuses anchored objects.
  const orderedPairs = (node: YAMLMap): YAMLMap['items'] => {
    let state = flattenedOrder.get(node);
    if (!state) flattenedOrder.set(node, state = { items: [...(originalPairs.get(node) ?? node.items)] });
    const merged: YAMLMap['items'] = [];
    for (let index = 0; index < state.items.length;) {
      const pair = state.items[index]!;
      if (!isScalar(pair.key) || typeof pair.key.value !== 'symbol' || pair.key.value.description !== '<<') { index++; continue; }
      state.items.splice(index, 1);
      const value = isAlias(pair.value) ? pair.value.resolve(document) : pair.value;
      if (isMap(value)) merged.push(...orderedPairs(value));
      else if (isSeq(value)) {
        const groups = value.items.map(item => orderedPairs((isAlias(item) ? item.resolve(document) : item) as YAMLMap));
        for (const group of groups.reverse()) merged.push(...group);
      }
    }
    if (merged.length) state.items = [...merged, ...state.items];
    return state.items;
  };
  const collectionTags = ['tag:yaml.org,2002:omap', 'tag:yaml.org,2002:pairs', 'tag:yaml.org,2002:set', 'tag:yaml.org,2002:map', 'tag:yaml.org,2002:seq'];
  const safeTags = new Set(['null', 'bool', 'int', 'float', 'binary', 'timestamp', 'omap', 'pairs', 'set', 'str', 'seq', 'map'].map(name => `tag:yaml.org,2002:${name}`));
  const scalarTags = new Set(['null', 'bool', 'int', 'float', 'binary', 'timestamp', 'str'].map(name => `tag:yaml.org,2002:${name}`));
  const wrappedScalars = new WeakMap<object, any>();
  const scalarRepr = (key: string): string => {
    const quote = key.includes("'") && !key.includes('"') ? '"' : "'";
    const escaped = [...key].map(char => {
      if (char === quote || char === '\\') return '\\' + char;
      if (char === '\n') return '\\n'; if (char === '\r') return '\\r'; if (char === '\t') return '\\t';
      if (char !== ' ' && /[\p{C}\p{Z}]/u.test(char)) {
        const n = char.codePointAt(0)!;
        return '\\' + (n <= 255 ? 'x' : n <= 65535 ? 'u' : 'U') + n.toString(16).padStart(n <= 255 ? 2 : n <= 65535 ? 4 : 8, '0');
      }
      return char;
    }).join('');
    return quote + escaped + quote;
  };
  const booleanScalar = (text: string): boolean => {
    const key = text.toLowerCase();
    if (['yes', 'true', 'on'].includes(key)) return true;
    if (['no', 'false', 'off'].includes(key)) return false;
    throw Object.assign(new Error(scalarRepr(key)), { name: 'KeyError' });
  };
  const numericText = (text: string): string => {
    return text.replace(/^[\t-\r \u0085\p{Z}]+|[\t-\r \u0085\p{Z}]+$/gu, '').replace(/\p{Nd}/gu, digit => {
        const code = digit.codePointAt(0)!;
        let first = code;
        while (first > 0 && /\p{Nd}/u.test(String.fromCodePoint(first - 1))) first--;
        return String((code - first) % 10);
      });
  };
  const integerScalar = (text: string): bigint => {
    let value = text.replaceAll('_', '');
    const empty = (): never => { throw Object.assign(new Error('string index out of range'), { name: 'IndexError' }); };
    if (!value.length) empty();
    const sign = value[0] === '-' ? -1n : 1n;
    if (value[0] === '+' || value[0] === '-') value = value.slice(1);
    if (value === '0') return 0n;
    const integer = (part: string, base: number): bigint => {
      if (base === 10) return BigInt(pythonInteger(part, true));
      let normalized = numericText(part).toLowerCase();
      const localSign = normalized[0] === '-' ? -1n : 1n;
      if (normalized[0] === '+' || normalized[0] === '-') normalized = normalized.slice(1);
      const prefix = base === 2 ? '0b' : base === 8 ? '0o' : base === 16 ? '0x' : '';
      if (prefix && normalized.startsWith(prefix)) normalized = normalized.slice(2);
      const valid = base === 2 ? /^[01]+$/ : base === 8 ? /^[0-7]+$/ : base === 16 ? /^[0-9a-f]+$/ : /^[0-9]+$/;
      if (!valid.test(normalized)) throw Object.assign(new Error(`invalid literal for int() with base ${base}: ${[...scalarRepr(part)].slice(0, 200).join('')}`), { name: 'ValueError' });
      let result = 0n;
      for (const digit of normalized) result = result * BigInt(base) + BigInt(parseInt(digit, base));
      return localSign * result;
    };
    if (value.startsWith('0b')) return sign * integer(value.slice(2), 2);
    if (value.startsWith('0x')) return sign * integer(value.slice(2), 16);
    if (!value.length) empty();
    if (value[0] === '0') return sign * integer(value, 8);
    if (!value.includes(':')) return sign * integer(value, 10);
    const digits = value.split(':').map(part => integer(part, 10)).reverse();
    let result = 0n, base = 1n;
    for (const digit of digits) { result += digit * base; base *= 60n; }
    return sign * result;
  };
  const floatScalar = (text: string): number => {
    let value = text.replaceAll('_', '').toLowerCase();
    if (!value.length) throw Object.assign(new Error('string index out of range'), { name: 'IndexError' });
    const sign = value[0] === '-' ? -1 : 1;
    if (value[0] === '+' || value[0] === '-') value = value.slice(1);
    if (value === '.inf') return sign * Infinity;
    if (value === '.nan') return NaN;
    const number = (part: string): number => {
      const normalized = numericText(part);
      if (/^[+-]?(?:inf(?:inity)?|nan)$/i.test(normalized)) return /nan/i.test(normalized) ? NaN : normalized[0] === '-' ? -Infinity : Infinity;
      if (!/^[+-]?(?:[0-9]+(?:\.[0-9]*)?|\.[0-9]+)(?:e[+-]?[0-9]+)?$/i.test(normalized)) {
        throw Object.assign(new Error(`could not convert string to float: ${scalarRepr(part)}`), { name: 'ValueError' });
      }
      return Number(normalized);
    };
    if (!value.includes(':')) return sign * number(value);
    const digits = value.split(':').map(number).reverse();
    let result = 0, base = 1;
    for (const digit of digits) { result += digit * base; base *= 60; }
    return sign * result;
  };
  const binaryScalar = (text: string, node: unknown, scalar: Scalar): Uint8Array => {
    let chars = [...text];
    if (scalar.type === 'QUOTE_DOUBLE' && scalar.range) {
      // JS strings combine adjacent surrogate escapes during code-point iteration;
      // PyYAML keeps each escaped surrogate as a separate Python character.
      const replacements = new Map<string, string>();
      let marker = 0xe000;
      const raw = source.slice(scalar.range[0], scalar.range[1]);
      const marked = raw.replace(/\\(?:u[0-9a-fA-F]{4}|U[0-9a-fA-F]{8}|.)/g, escape => {
        if (escape[1] !== 'u' && escape[1] !== 'U') return escape;
        const code = parseInt(escape.slice(2), 16);
        if (code < 0xd800 || code > 0xdfff) return escape;
        while (text.includes(String.fromCodePoint(marker))) marker++;
        const key = String.fromCodePoint(marker++);
        replacements.set(key, String.fromCharCode(code));
        return key;
      });
      if (replacements.size) {
        const value = parseDocument(marked, { version: '1.1' }).contents;
        if (isScalar(value) && typeof value.value === 'string') chars = [...value.value].map(char => replacements.get(char) ?? char);
      }
    }
    const first = chars.findIndex(char => char.codePointAt(0)! > 127);
    if (first >= 0) {
      let end = first + 1;
      while (end < chars.length && chars[end]!.codePointAt(0)! > 127) end++;
      const code = chars[first]!.codePointAt(0)!;
      const escaped = '\\' + (code <= 255 ? 'x' : code <= 65535 ? 'u' : 'U') + code.toString(16).padStart(code <= 255 ? 2 : code <= 65535 ? 4 : 8, '0');
      const location = end === first + 1 ? `character '${escaped}' in position ${first}` : `characters in position ${first}-${end - 1}`;
      constructionError(null, node, `failed to convert base64 data into ascii: 'ascii' codec can't encode ${location}: ordinal not in range(128)`, node);
    }
    let data = '', padding = 0, complete = false;
    for (const char of text) {
      if (/[A-Za-z0-9+/]/.test(char)) { data += char; padding = 0; }
      else if (char === '=' && data.length % 4 >= 2) {
        padding++;
        if (data.length % 4 + padding >= 4) { complete = true; break; }
      }
    }
    if (!complete && data.length % 4 !== 0) {
      const problem = data.length % 4 === 1
        ? `Invalid base64-encoded string: number of data characters (${data.length}) cannot be 1 more than a multiple of 4`
        : 'Incorrect padding';
      constructionError(null, node, `failed to decode base64 data: ${problem}`, node);
    }
    return Buffer.from(data, 'base64');
  };
  const scalarNode = (value: unknown, active = new Set<object>()): Scalar => {
    const node = isAlias(value) ? value.resolve(document) : value;
    if (isScalar(node)) return node;
    if (isMap(node)) {
      if (active.has(node)) throw Object.assign(new Error('maximum recursion depth exceeded'), { name: 'RecursionError' });
      active.add(node);
      for (const pair of node.items) {
        if (isScalar(pair.key) && (pair.key.tag === 'tag:yaml.org,2002:value' || (!pair.key.tag && pair.key.type === 'PLAIN' && pair.key.source === '='))) return scalarNode(pair.value, active);
      }
    }
    return constructionError(null, node, `expected a scalar node, but found ${isMap(node) ? 'mapping' : 'sequence'}`, node);
  };
  const validateMerges = (node: YAMLMap, active = new Set<object>()): void => {
    if (active.has(node)) return;
    active.add(node);
    for (const pair of node.items) {
      const key = isAlias(pair.key) ? pair.key.resolve(document) : pair.key;
      if (isScalar(key) && (key.tag === 'tag:yaml.org,2002:value' || (!key.tag && key.type === 'PLAIN' && key.source === '='))) {
        key.tag = 'tag:yaml.org,2002:str';
        key.value = key.source ?? String(key.value);
      }
      if (!isScalar(pair.key) || typeof pair.key.value !== 'symbol' || pair.key.value.description !== '<<') continue;
      const value = isAlias(pair.value) ? pair.value.resolve(document) : pair.value;
      if (isMap(value)) validateMerges(value, active);
      else if (isSeq(value)) {
        for (const item of value.items) {
          const mapping = isAlias(item) ? item.resolve(document) : item;
          if (!isMap(mapping)) constructionError('while constructing a mapping', node, `expected a mapping for merging, but found ${isSeq(mapping) ? 'sequence' : 'scalar'}`, mapping);
          validateMerges(mapping as YAMLMap, active);
        }
      } else constructionError('while constructing a mapping', node, 'expected a mapping or list of mappings for merging, but found scalar', value);
    }
    active.delete(node);
  };
  const pending: Array<YAMLMap | YAMLSeq | Scalar> = [], constructed = new WeakSet<object>();
  const enqueue = (value: unknown): void => {
    const node = isAlias(value) ? value.resolve(document) : value;
    if (isScalar(node) && !node.tag && node.type === 'PLAIN' && ['=', '<<'].includes(node.source ?? '')) node.tag = `tag:yaml.org,2002:${node.source === '=' ? 'value' : 'merge'}`;
    if ((isScalar(node) || isMap(node) || isSeq(node)) && node.tag && !safeTags.has(node.tag)) {
      constructionError(null, node, `could not determine a constructor for the tag '${node.tag}'`, node);
    }
    if (isScalar(node) && (node.tag === 'tag:yaml.org,2002:timestamp' || node.value instanceof Date)) node.value = constructYamlTimestamp(node.source ?? String(node.value));
    if (isScalar(node) && node.tag === 'tag:yaml.org,2002:binary') node.value = binaryScalar(node.source ?? String(node.value), node, node);
    if (isScalar(node) && (node.tag === 'tag:yaml.org,2002:int' || typeof node.value === 'bigint')) node.value = integerScalar(node.source ?? String(node.value));
    if (isScalar(node) && node.tag === 'tag:yaml.org,2002:float') node.value = floatScalar(node.source ?? String(node.value));
    if (isScalar(node) && node.tag === 'tag:yaml.org,2002:null') node.value = null;
    if (isScalar(node) && node.tag === 'tag:yaml.org,2002:bool') node.value = booleanScalar(node.source ?? String(node.value));
    if ((isMap(node) || isSeq(node)) && scalarTags.has(node.tag ?? '')) {
      const scalar = scalarNode(node);
      // PyYAML validates the wrapper, then its timestamp constructor still
      // matches the original mapping value (a list), which raises TypeError.
      if (node.tag === 'tag:yaml.org,2002:timestamp') throw new TypeError("expected string or bytes-like object, got 'list'");
      const text = scalar.source ?? String(scalar.value ?? '');
      if (node.tag === 'tag:yaml.org,2002:str') wrappedScalars.set(node, text);
      else if (node.tag === 'tag:yaml.org,2002:null') wrappedScalars.set(node, null);
      else if (node.tag === 'tag:yaml.org,2002:binary') wrappedScalars.set(node, binaryScalar(text, node, scalar));
      else if (node.tag === 'tag:yaml.org,2002:int') wrappedScalars.set(node, integerScalar(text));
      else if (node.tag === 'tag:yaml.org,2002:float') wrappedScalars.set(node, floatScalar(text));
      else if (node.tag === 'tag:yaml.org,2002:bool') wrappedScalars.set(node, booleanScalar(text));
      else {
        const tagged = parseDocument(`!<${node.tag}> ${JSON.stringify(text)}`, { schema: document.schema, version: '1.1', intAsBigInt: true });
        if (tagged.errors.length) throw tagged.errors[0];
        if (!isScalar(tagged.contents)) throw new TypeError('expected constructed YAML scalar');
        const value = tagged.contents.value;
        if (value instanceof Date) rememberYamlDate(value, text);
        wrappedScalars.set(node, value);
      }
      return;
    }
    if ((!isMap(node) && !isSeq(node) && !(isScalar(node) && collectionTags.includes(node.tag ?? ''))) || constructed.has(node)) return;
    constructed.add(node); pending.push(node);
  };
  enqueue(document.contents);
  for (let index = 0; index < pending.length; index++) {
    const node = pending[index]!;
    const kind = isMap(node) ? 'mapping' : isSeq(node) ? 'sequence' : 'scalar';
    if (['tag:yaml.org,2002:set', 'tag:yaml.org,2002:map'].includes(node.tag ?? '') && !isMap(node)) constructionError(null, node, `expected a mapping node, but found ${kind}`, node);
    if (node.tag === 'tag:yaml.org,2002:seq' && !isSeq(node)) constructionError(null, node, `expected a sequence node, but found ${kind}`, node);
    if (['tag:yaml.org,2002:omap', 'tag:yaml.org,2002:pairs'].includes(node.tag ?? '') && !isSeq(node)) {
      constructionError(node.tag?.endsWith(':pairs') ? 'while constructing pairs' : 'while constructing an ordered map', node, `expected a sequence, but found ${kind}`, node);
    }
    if (isSeq(node) && ['tag:yaml.org,2002:omap', 'tag:yaml.org,2002:pairs'].includes(node.tag ?? '')) {
      for (const item of node.items) {
        const mapping = isAlias(item) ? item.resolve(document) : item;
        const context = node.tag?.endsWith(':pairs') ? 'while constructing pairs' : 'while constructing an ordered map';
        if (!isMap(mapping)) constructionError(context, node, `expected a mapping of length 1, but found ${isSeq(mapping) ? 'sequence' : 'scalar'}`, mapping);
        const pairMapping = mapping as YAMLMap;
        if (pairMapping.items.length !== 1) constructionError(context, node, `expected a single mapping item, but found ${pairMapping.items.length} items`, pairMapping);
        enqueue(pairMapping.items[0]!.key); enqueue(pairMapping.items[0]!.value);
      }
    } else if (isMap(node)) {
      validateMerges(node);
      for (const pair of orderedPairs(node)) {
        const key = isAlias(pair.key) ? pair.key.resolve(document) : pair.key;
        enqueue(key);
        if (!wrappedScalars.has(key as object) && (isMap(key) || isSeq(key) || (isScalar(key) && collectionTags.includes(key.tag ?? '')))) constructionError('while constructing a mapping', node, 'found unhashable key', key);
        enqueue(pair.value);
      }
    } else if (isSeq(node)) for (const item of node.items) enqueue(item);
  }
  document.warnings.forEach(warning => {
    const unresolved = /^Unresolved tag: (\S+)/.exec(warning.message);
    // Unknown tags on constructed nodes have already failed above. Remaining
    // ones belong to wrappers consumed by merge/pairs, which SafeLoader ignores.
    if (warning.code === 'TAG_RESOLVE_FAILED' && unresolved && (!safeTags.has(unresolved[1]!) || scalarTags.has(unresolved[1]!))) return;
    process.emitWarning(warning);
  });
  const constructedValues = new WeakMap<object, any>();
  const mergedResults: Array<{ node: YAMLMap; result: any }> = [];
  visit(document, {
    Seq(_key, node) {
      if (!['tag:yaml.org,2002:omap', 'tag:yaml.org,2002:pairs'].includes(node.tag ?? '')) {
        const original = node.toJSON;
        node.toJSON = (arg, ctx) => {
          const result = original.call(node, arg, ctx);
          constructedValues.set(node, result);
          return result;
        };
        return;
      }
      node.toJSON = (arg, ctx) => {
        const sequence = new YAMLSeq();
        for (const item of node.items) {
          const mapping = isAlias(item) ? item.resolve(document) : item;
          if (!isMap(mapping) || mapping.items.length !== 1) throw new TypeError('expected a single mapping item in YAML ordered pairs');
          const pair = mapping.items[0]!, tuple = new YAMLSeq();
          tuple.items = [pair.key, pair.value];
          tuple.toJSON = (arg, ctx) => rememberPythonTuple(YAMLSeq.prototype.toJSON.call(tuple, arg, ctx));
          sequence.items.push(tuple);
        }
        // Keep the original mapping nodes in the document so anchors on pair
        // entries still resolve to mappings, as they do in Python's loader.
        const result = YAMLSeq.prototype.toJSON.call(sequence, arg, ctx);
        constructedValues.set(node, result);
        return result;
      };
    },
    Scalar(_key, node) {
      if (node.value instanceof Date) rememberYamlDate(node.value, node.source ?? '');
    },
    Map(_key, node) {
      originalPairs.set(node, node.items.map(pair => new Pair(pair.key, pair.value)));
      const explicitKeys = node.items.flatMap(pair => isScalar(pair.key) && typeof pair.key.value === 'string' ? [pair.key.value] : []);
      const original = node.toJSON;
      node.toJSON = (arg, ctx, Type) => {
        if (wrappedScalars.has(node)) {
          const result = wrappedScalars.get(node)!;
          constructedValues.set(node, result);
          return result;
        }
        const ordered = orderedPairs(node);
        const result = node.tag === 'tag:yaml.org,2002:set'
          ? YAMLMap.prototype.toJSON.call(node, arg, ctx, TypedYamlSet)
          : Reflect.apply(original, node, [arg, ctx, Type ?? (needsTypedKeys(node) ? TypedYamlMap : undefined)]);
        if (result instanceof Map) {
          const previous = new TypedYamlMap(result);
          result.clear();
          for (const pair of ordered) {
            const key = isAlias(pair.key) ? pair.key.resolve(document) : pair.key;
            if (isScalar(key) && previous.has(key.value) && !result.has(key.value)) result.set(key.value, previous.get(key.value));
          }
          for (const [key, value] of previous) if (!result.has(key)) result.set(key, value);
        }
        if (result && !(result instanceof Map) && !(result instanceof Set)) {
          const stringKeys = ordered.flatMap(pair => isScalar(pair.key) && typeof pair.key.value === 'string' ? [pair.key.value] : []);
          const keys = [...new Set([...stringKeys, ...(mergedKeyOrders.get(result) ?? []), ...explicitKeys, ...Object.keys(result)])];
          mergedKeyOrders.set(result, keys);
          rememberKeyOrder(result, keys);
        }
        constructedValues.set(node, result);
        if (originalPairs.get(node)!.some(pair => isScalar(pair.key) && typeof pair.key.value === 'symbol' && pair.key.value.description === '<<')) mergedResults.push({ node, result });
        return result;
      };
      const merges = node.items.filter(pair => isScalar(pair.key) && typeof pair.key.value === 'symbol' && pair.key.value.description === '<<');
      if (merges.length < 2) return;
      const sequence = new YAMLSeq();
      for (const pair of [...merges].reverse()) {
        const value = isAlias(pair.value) ? pair.value.resolve(document) : pair.value;
        sequence.items.push(...(isSeq(value) ? value.items : [pair.value]));
      }
      merges[0]!.value = sequence;
      node.items = node.items.filter(pair => !merges.includes(pair) || pair === merges[0]);
    },
  });
  const parsed = document.toJS({ maxAliasCount: -1 });
  const constructedValue = (value: unknown): any => {
    const node = isAlias(value) ? value.resolve(document) : value;
    if (isScalar(node)) return node.value;
    if (node == null) return null;
    if (constructedValues.has(node as object)) return constructedValues.get(node as object);
    throw new Error('missing constructed YAML merge value');
  };
  // Complete merges after all containers exist; reading an unfinished alias
  // during conversion otherwise loses later fields and recursive references.
  for (const { node, result } of mergedResults) {
    if (result instanceof Map || result instanceof Set) result.clear();
    else for (const key of Object.keys(result)) delete result[key];
    for (const pair of orderedPairs(node)) {
      const key = constructedValue(pair.key);
      if (result instanceof Set) result.add(key);
      else {
        const value = constructedValue(pair.value);
        if (result instanceof Map) result.set(key, value);
        else Object.defineProperty(result, key, { value, writable: true, enumerable: true, configurable: true });
      }
    }
  }
  // Preserve alias identity and cycles while returning ordinary JS numbers.
  // BigInt is only an intermediate that distinguishes YAML ints from floats.
  const seen = new WeakSet<object>();
  function normalize(value: any, owner?: object, key?: string): any {
    if (typeof value === 'bigint' || typeof value === 'number') {
      const number = Number(value);
      if (owner && key !== undefined) rememberNumber(owner, key, number, typeof value === 'bigint' ? value.toString() : '0.0');
      return number;
    }
    if (!value || typeof value !== 'object' || seen.has(value)) return value;
    seen.add(value);
    if (value instanceof Map) {
      const entries = [...value]; value.clear();
      for (const [key, item] of entries) {
        const mappedKey = typeof key === 'bigint' && !Number.isSafeInteger(Number(key)) ? key : normalize(key);
        value.set(mappedKey, normalize(item));
        const source = (v: any) => typeof v === 'bigint' ? v.toString() : typeof v === 'number' ? '0.0' : undefined;
        rememberMapSources(value, mappedKey, source(key), source(item));
      }
    } else if (value instanceof Set) {
      const entries = [...value]; value.clear();
      for (const item of entries) {
        const normalized = typeof item === 'bigint' && !Number.isSafeInteger(Number(item)) ? item : normalize(item);
        value.add(normalized);
        if (typeof item === 'bigint' || typeof item === 'number') rememberSetNumber(value, normalized, typeof item === 'bigint' ? item.toString() : '0.0');
      }
    } else {
      const mergedKeys = mergedKeyOrders.get(value);
      if (mergedKeys) {
        const keys = [...new Set([...mergedKeys, ...Object.keys(value)])].filter(key => Object.hasOwn(value, key));
        const descriptors = keys.map(key => [key, Object.getOwnPropertyDescriptor(value, key)!] as const);
        for (const key of keys) delete value[key];
        for (const [key, descriptor] of descriptors) Object.defineProperty(value, key, descriptor);
      }
      for (const key of Object.keys(value)) value[key] = normalize(value[key], value, key);
    }
    return value;
  }
  return normalize(parsed);
}

export function available(root = WORKFLOWS): string[] {
  if (!existsSync(root)) return [];
  return readdirSync(root).filter(name => existsSync(path.join(root, name, 'SKILL.md'))).sort();
}

export function pageSkillDescriptions(root = WORKFLOWS): string {
  return PAGE_WORKFLOWS.map(name => {
    const file = path.join(root, name, 'SKILL.md');
    const header = read(file, true).match(/^---\n(.*?)\n---(?:\n|$)/s);
    if (!header) throw new Error(`missing skill frontmatter: ${file}`);
    const metadata = parseYaml(header[1]!);
    const displayName = metadata instanceof Map ? metadata.get('name') : metadata.name;
    const description = metadata instanceof Map ? metadata.get('description') : metadata.description;
    return `- ${displayName}: ${description.trim()}`;
  }).join('\n');
}

function auxSampleCatalog(name: string, root: string): string {
  const skill = path.join(root, name);
  const file = path.join(skill, 'samples/catalog.json');
  if (!existsSync(file)) return '';
  const catalog = JSON.parse(read(file, true));
  const categories = new Map<string, string[]>();
  for (const sample of catalog.samples ?? []) {
    if (sample.aux === false || !sample.mini || typeof sample.mini !== 'object' || Array.isArray(sample.mini)) continue;
    const file = path.resolve(skill, 'samples/bundles', sample.category, `${sample.id}.mini.md`);
    if (!existsSync(file)) throw new Error(`registered auxiliary sample is missing: ${file}`);
    if (!categories.has(sample.category)) categories.set(sample.category, []);
    categories.get(sample.category)!.push(sample.id);
  }
  if (!categories.size) return '';
  return [
    `<aux_sample_catalog workflow="${name}">`,
    'Auxiliary mode is enabled for this run. In the same first response, after choosing Main, read zero to three ids below from the selected category. Never choose the Main sample\'s id again.',
    'Path: `samples/bundles/<category>/<id>.mini.md`',
    ...[...categories.keys()].sort().map(category => `- ${category}: ${categories.get(category)!.join(', ')}`),
    '</aux_sample_catalog>',
  ].join('\n');
}

const READ_BOTH = 'then issue parallel `Read` calls for exactly one reference and one Main from the same category. Do not read any other sample.';
const READ_REFERENCE_ONLY = 'then `Read` exactly one reference for that category. This run supplies no worked sample; do not look for one, and build from the reference alone.';
const CODE_ONE = `In your first response, issue these three calls in parallel:

- \`Read(<skill-dir>/references/code.md)\`
- \`Read(<skill-dir>/samples/bundles/code/code-core-bundle.one.md)\`
- \`CodeScaffold()\`

The sample bundle carries one worked author layer. Transfer its state/trace/evidence architecture to this page's algorithm; do not copy its learner code, data, labels, or styling.`;
const CODE_NONE = `In your first response, issue these two calls in parallel:

- \`Read(<skill-dir>/references/code.md)\`
- \`CodeScaffold()\`

This run supplies no worked sample. Build the state/trace/evidence architecture from the reference alone.`;

function applySampleMode(name: string, body: string, mode: string): string {
  if (mode === 'mini') return body;
  if (name === 'build-code') {
    if (!body.includes(CODE_ONE)) throw new Error('build-code/SKILL.md no longer carries the三-call block');
    return body.replace(CODE_ONE, CODE_NONE);
  }
  if (!body.includes(READ_BOTH)) throw new Error(`${name}/SKILL.md no longer carries the Main-read sentence`);
  const start = body.indexOf('## Samples');
  if (start < 0) throw new Error(`${name}/SKILL.md has no '## Samples' section`);
  return body.slice(0, start).trimEnd().replace(READ_BOTH, READ_REFERENCE_ONLY);
}

export function routedWorkflow(name: string, root = WORKFLOWS, options: { includeAux?: boolean; samples?: string; template?: boolean } = {}): string {
  const samples = options.samples ?? 'mini';
  if (!(PAGE_WORKFLOWS as readonly string[]).includes(name)) throw new Error(`unknown routed workflow ${name}`);
  if (!['mini', 'none'].includes(samples)) throw new Error(`unknown sample mode ${samples}`);
  const includeAux = options.includeAux ?? samples !== 'none';
  if (includeAux && samples === 'none') throw new Error('--aux-samples 需要一个 Main,不能配 samples=none');
  const file = path.join(root, name, 'SKILL.md');
  if (!existsSync(file)) throw new Error(`routed workflow is not installed: ${file}`);
  let body = read(file).trim();
  if (options.template && name !== 'build-code') {
    const sections = [...body.matchAll(/<!--teaching:start-->\s*([\s\S]*?)\s*<!--teaching:end-->/g)];
    if (sections.length !== 1 || !sections[0]![1]!.trim()) throw new Error(`${file} needs exactly one teaching section`);
    return `<workflow_skill name="${name}">\n${sections[0]![1]}\n</workflow_skill>`;
  }
  body = body.replace(/<!--teaching:(?:start|end)-->\n?/g, '');
  body = applySampleMode(name, body, samples).replace(/^---\n.*?\n---\s*/s, '');
  const aux = includeAux ? auxSampleCatalog(name, root) : '';
  if (aux) {
    const marker = 'Do not read any other sample.';
    if (!body.includes(marker)) throw new Error(`${file} is missing the main-only sample policy`);
    body = body.replace(marker, 'Follow the appended `<aux_sample_catalog>` in the same first response.');
  }
  body = body.replaceAll('<skill-dir>/', '').replaceAll('<skill-dir>', path.resolve(root, name));
  return `<workflow_skill name="${name}">\n${body}\n</workflow_skill>` + (aux ? `\n\n${aux}` : '');
}

export function philosophyBlock(scope: string, root = PROMPTS): string {
  if (!['deck', 'page'].includes(scope)) throw new Error(`unknown philosophy scope ${scope}`);
  const file = path.join(root, 'philosophy.md');
  const blocks = read(file).match(new RegExp(`<([a-z-]+) scope="${scope}">\\n.*?\\n</[a-z-]+>`, 'gs')) ?? [];
  if (!blocks.length) throw new Error(`${file} 里没有 scope="${scope}" 的块`);
  return `<design_philosophy>\n${blocks.join('\n\n')}\n</design_philosophy>`;
}

export function directionBlock(root = PROMPTS): string {
  return `<direction src="direction.md">\n${read(path.join(root, 'direction.md'), true).trim()}\n</direction>`;
}
function sourceBlock(root: string, sources: [string, string][]): string {
  return sources.map(([tag, name]) => {
    const file = path.join(root, name);
    if (!existsSync(file)) throw new Error(`guidance source is missing: ${file}`);
    return `<${tag}>\n${read(file).trim()}\n</${tag}>`;
  }).join('\n\n');
}
export function antiSlopBlock(root = WORKFLOWS, includeVisual = true): string {
  const copy = sourceBlock(root, [['anti_ai_slop_copy', 'scrub-copy-slop.md']]);
  return copy + (includeVisual ? '\n\n' + visualSlopBlock(root) : '');
}
export function visualSlopBlock(root = WORKFLOWS): string {
  return sourceBlock(root, [['anti_ai_slop_visual', 'scrub-visual-slop.md']]);
}
export function themeSlopBlock(root = WORKFLOWS): string {
  return sourceBlock(root, [['anti_ai_slop_theme', 'scrub-theme-slop.md']]);
}

/** Literal substitution, including the Python baseline's warning-only missing slots. */
export function fill(text: string, values: Record<string, string | number>, where = '?', warn = console.warn): string {
  const missing = [...new Set(text.match(/\{[a-z_][a-z0-9_]*\}/g) ?? [])].filter(slot => !(slot.slice(1, -1) in values)).sort();
  for (const [key, value] of Object.entries(values)) text = text.replaceAll(`{${key}}`, String(value));
  if (missing.length) warn(`      ⚠ 提示词 ${where} 里有 ${missing.join(' ')},调用处没传这几个键 —— 它们会原样进模型的输入,再原样出现在产物里。`);
  return text;
}
