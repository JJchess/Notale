/** Profile resolution from core/llm.py and workflow selection from core/builder.py. */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { decodeText } from '../../core/text.js';
import { isPythonTuple, pythonDateIso, pythonInteger, copyJsonMapping, mappingKeyNumberSource, setNumberSource, rememberKeyOrder, rememberNumber, rememberMapSources, inheritJsonProvenance, pythonNumberText, pythonObjectKeys, isPythonIntegerField } from '../../core/json.js';
import { PAGE_WORKFLOWS, RESOURCES, parseYaml, TypedYamlMap, yamlObjectType, pythonKeysEqual, tupleKeyItems } from '../../core/guidance.js';

type ConfigRecord = Record<string, any>;
export interface ResolvedProfile {
  id: string; model: string; base_url: string; api_key_env: string; adapter: string;
  reasoning_effort: string; vision_input: boolean; http_timeout_sec: number;
  max_output_tokens: number | bigint; request_options: Record<string, unknown>; replay_reasoning: boolean;
}
export function loadConfig(file = path.join(RESOURCES, 'config.yaml')): ConfigRecord {
  const cfg = parseYaml(decodeText(readFileSync(file)));
  // Python config() calls c["model"].update(_OVERRIDE), even with no overrides.
  const model = requiredConfigValue(cfg, 'model');
  if (!(model instanceof Map) && !(model instanceof Set) &&
      (model === null || typeof model !== 'object' || Object.getPrototypeOf(model) !== Object.prototype)) {
    throw Object.assign(new Error(`'${configuredType(model, cfg, 'model')}' object has no attribute 'update'`), { name: 'AttributeError' });
  }
  return cfg;
}

/** Optional field access for production consumers of YAML objects or typed maps. */
export function configValue(value: any, key: string, fallback?: any): any {
  if (value instanceof Map) return value.has(key) ? value.get(key) : fallback;
  return value != null && Object.hasOwn(value, key) ? value[key] : fallback;
}

export function pythonBool(value: unknown): boolean {
  if (value == null) return false;
  if (value instanceof Map || value instanceof Set) return value.size !== 0;
  if (value instanceof Uint8Array) return value.length !== 0;
  if (typeof value === 'number') return value !== 0;
  if (typeof value === 'string' || Array.isArray(value)) return value.length !== 0;
  if (typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype) return Object.keys(value).length !== 0;
  return Boolean(value);
}
function configuredType(value: any, owner?: ConfigRecord, key?: string): string {
  if (isPythonTuple(value)) return 'tuple';
  if (value !== null && typeof value === 'object') {
    const yamlType = yamlObjectType(value);
    if (yamlType) return yamlType;
  }
  if (typeof value === 'number' && owner && key !== undefined) return isPythonIntegerField(owner, key) ? 'int' : 'float';
  return value == null ? 'NoneType' : typeof value === 'bigint' ? 'int' : Array.isArray(value) ? 'list' : typeof value === 'boolean' ? 'bool' : typeof value === 'number' ? Number.isInteger(value) ? 'int' : 'float' : typeof value === 'object' ? 'dict' : 'str';
}
function requireHashable(value: any): void {
  if (isPythonTuple(value)) { value.forEach(requireHashable); return; }
  if (value instanceof Date || value instanceof Uint8Array) return;
  if (value !== null && typeof value === 'object') throw new TypeError(`unhashable type: '${configuredType(value)}'`);
}
/** A configuration mapping lookup must not silently box a scalar into JS properties. */
function configuredGet(value: any, key: any, fallback?: any): any {
  if (value instanceof Map) return value.has(key) ? value.get(key) : fallback;
  if (value !== null && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype) return typeof key === 'string' && Object.hasOwn(value, key) ? value[key] : fallback;
  const name = configuredType(value);
  throw Object.assign(new Error(`'${name}' object has no attribute 'get'`), { name: 'AttributeError' });
}
function configuredHas(value: any, key: any): boolean {
  return value instanceof Map ? value.has(key) : typeof key === 'string' && Object.hasOwn(value, key);
}
function configuredKeys(value: any): any[] { return value instanceof Map ? [...value.keys()] : Object.keys(value); }
function compareKeys(left: any, right: any): number {
  if (left instanceof Date && right instanceof Date) {
    if (configuredType(left) !== configuredType(right)) throw new TypeError("can't compare datetime.datetime to datetime.date");
    const a = pythonDateIso(left), b = pythonDateIso(right);
    const aware = (iso: string) => /[+-]\d{2}:\d{2}$/.test(iso);
    if (aware(a) !== aware(b)) throw new TypeError("can't compare offset-naive and offset-aware datetimes");
    // Date stores milliseconds; retain the remaining Python microseconds when equal.
    const delta = left.getTime() - right.getTime();
    if (delta) return delta;
    const micros = (iso: string) => Number((iso.match(/\.(\d+)/)?.[1] ?? '').padEnd(6, '0').slice(3));
    return micros(a) - micros(b);
  }
  if (left instanceof Uint8Array && right instanceof Uint8Array) {
    for (let i = 0; i < Math.min(left.length, right.length); i++) if (left[i] !== right[i]) return left[i]! - right[i]!;
    return left.length - right.length;
  }
  if (isPythonTuple(left) && isPythonTuple(right)) {
    const a = tupleKeyItems(left), b = tupleKeyItems(right);
    for (let i = 0; i < Math.min(a.length, b.length); i++) if (!pythonKeysEqual(a[i], b[i])) return compareKeys(a[i], b[i]);
    return a.length - b.length;
  }
  if (typeof left === 'string' && typeof right === 'string') {
    const a = Array.from(left, char => char.codePointAt(0)!), b = Array.from(right, char => char.codePointAt(0)!);
    for (let i = 0; i < Math.min(a.length, b.length); i++) if (a[i] !== b[i]) return a[i]! - b[i]!;
    return a.length - b.length;
  }
  if (['number', 'boolean', 'bigint'].includes(typeof left) && ['number', 'boolean', 'bigint'].includes(typeof right)) return left < right ? -1 : left > right ? 1 : 0;
  throw new TypeError(`'<' not supported between instances of '${configuredType(left)}' and '${configuredType(right)}'`);
}
function profileChoices(profiles: any): string {
  const keys = configuredKeys(profiles).sort(compareKeys);
  for (const [index, key] of keys.entries()) if (typeof key !== 'string') throw new TypeError(`sequence item ${index}: expected str instance, ${configuredType(key)} found`);
  return keys.join(', ') || '(none)';
}
/** Python dict(value or {}) for JSON-shaped profile mappings and pair sequences. */
function configuredDict(value: any): ConfigRecord {
  if (!pythonBool(value)) return {};
  if (value instanceof Map) return copyJsonMapping(value);
  if (typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype) return inheritJsonProvenance({ ...value }, value);
  const typeName = configuredType;
  if (!Array.isArray(value) && typeof value !== 'string' && !(value instanceof Set) && !(value instanceof Uint8Array)) throw new TypeError(`'${typeName(value)}' object is not iterable`);
  const entries: { key: any; value: any; keySource: string | undefined; valueSource: string | undefined }[] = [];
  let index = 0;
  for (const item of value) {
    const pair = Array.isArray(item) || typeof item === 'string' || item instanceof Set || item instanceof Uint8Array ? Array.from(item as Iterable<any>) : item instanceof Map ? [...item.keys()] : item && typeof item === 'object' && Object.getPrototypeOf(item) === Object.prototype ? pythonObjectKeys(item) : null;
    if (!pair) throw new TypeError(`cannot convert dictionary update sequence element #${index} to a sequence`);
    if (pair.length !== 2) throw Object.assign(new Error(`dictionary update sequence element #${index} has length ${pair.length}; 2 is required`), { name: 'ValueError' });
    let key = pair[0];
    requireHashable(key);
    const numberSource = (position: number): string | undefined => typeof pair[position] === 'number'
      ? item instanceof Map ? mappingKeyNumberSource(item, pair[position]) ?? pythonNumberText(pair[position])
        : pythonNumberText(pair[position], Array.isArray(item) ? item : undefined, String(position)) : undefined;
    const keySource = numberSource(0), valueSource = numberSource(1);
    if (typeof key === 'number' && !Number.isSafeInteger(key) && keySource && /^-?\d+$/.test(keySource)) key = BigInt(keySource);
    entries.push({ key, value: pair[1], keySource, valueSource });
    index++;
  }
  const result: ConfigRecord = entries.some(entry => typeof entry.key !== 'string') ? new TypedYamlMap() : {};
  for (const { key, value: item, keySource, valueSource } of entries) {
    if (result instanceof Map) {
      result.set(key, item);
      rememberMapSources(result, key, keySource, valueSource);
    } else {
      Object.defineProperty(result, key, { value: item, enumerable: true, configurable: true, writable: true });
      if (valueSource !== undefined) rememberNumber(result, key, item, valueSource);
    }
  }
  if (!(result instanceof Map)) rememberKeyOrder(result, entries.map(entry => entry.key));
  return result;
}
function configuredInteger(...values: unknown[]): number { return pythonInteger(values.find(pythonBool)); }
function configuredMaxTokens(raw: ConfigRecord, defaults: ConfigRecord = {}): number | bigint {
  const owner = pythonBool(configuredGet(raw, 'max_output_tokens')) ? raw : defaults;
  const value = configuredGet(owner, 'max_output_tokens');
  if (!pythonBool(value)) return 128000;
  if (typeof value === 'number' && !Number.isSafeInteger(value) && isPythonIntegerField(owner, 'max_output_tokens')) {
    return BigInt(pythonNumberText(value, owner, 'max_output_tokens'));
  }
  return pythonInteger(value, true);
}
function configurationError(message: string): Error { return Object.assign(new Error(message), { name: 'ValueError' }); }
function dateRepr(value: Date): string {
  const iso = pythonDateIso(value);
  const [date, time] = iso.split('T');
  const parts = date!.split('-').map(Number);
  if (!time) return `datetime.date(${parts.join(', ')})`;
  const match = /^(\d+):(\d+):(\d+)(?:\.(\d+))?([+-])(\d+):(\d+)$/.exec(time)
    ?? /^(\d+):(\d+):(\d+)(?:\.(\d+))?$/.exec(time);
  if (!match) throw new TypeError('invalid datetime representation');
  const [, hour, minute, second, fraction, sign, zoneHour, zoneMinute] = match;
  const micros = Number((fraction ?? '').padEnd(6, '0'));
  parts.push(Number(hour), Number(minute));
  if (Number(second) || micros) parts.push(Number(second));
  if (micros) parts.push(micros);
  let zone = '';
  if (sign) {
    const offset = (Number(zoneHour) * 3600 + Number(zoneMinute) * 60) * (sign === '-' ? -1 : 1);
    const days = Math.floor(offset / 86400), seconds = offset - days * 86400;
    const delta = [...(days ? [`days=${days}`] : []), ...(seconds ? [`seconds=${seconds}`] : [])];
    zone = ', tzinfo=' + (offset === 0 ? 'datetime.timezone.utc' : `datetime.timezone(datetime.timedelta(${delta.join(', ')}))`);
  }
  return `datetime.datetime(${parts.join(', ')}${zone})`;
}
/** Python str/repr for configuration values. */
function repr(value: unknown, owner?: object, key?: any, active = new Set<object>()): string {
  if (value == null) return 'None';
  if (value instanceof Date) return dateRepr(value);
  if (value instanceof Uint8Array) {
    const quote = value.includes(39) && !value.includes(34) ? '"' : "'";
    return 'b' + quote + Array.from(value, byte => {
      const char = String.fromCharCode(byte);
      if (char === quote || byte === 92) return '\\' + char;
      if (byte === 9) return '\\t';
      if (byte === 10) return '\\n';
      if (byte === 13) return '\\r';
      return byte < 32 || byte >= 127 ? '\\x' + byte.toString(16).padStart(2, '0') : char;
    }).join('') + quote;
  }
  if (typeof value === 'bigint') return value.toString();
  if (typeof value === 'boolean') return value ? 'True' : 'False';
  if (typeof value === 'number') { const text = pythonNumberText(value, owner, key); return text === 'NaN' ? 'nan' : text === 'Infinity' ? 'inf' : text === '-Infinity' ? '-inf' : text; }
  if (typeof value === 'object') {
    if (active.has(value)) return isPythonTuple(value) ? '(...)' : Array.isArray(value) ? '[...]' : '{...}';
    active.add(value);
    try {
      if (value instanceof Set) return value.size ? '{' + [...value].map(item => {
        const owner = { item }, source = setNumberSource(value, item);
        if (source !== undefined) rememberNumber(owner, 'item', item, source);
        return repr(item, owner, 'item', active);
      }).join(', ') + '}' : 'set()';
      if (value instanceof Map) return '{' + [...value].map(([key, item]) => {
        const keyOwner = { key }, source = mappingKeyNumberSource(value, key);
        if (source !== undefined) rememberNumber(keyOwner, 'key', key, source);
        return repr(key, keyOwner, 'key', active) + ': ' + repr(item, value, key, active);
      }).join(', ') + '}';
      if (Array.isArray(value)) {
        const body = value.map((item, index) => repr(item, value, String(index), active)).join(', ');
        return isPythonTuple(value) ? '(' + body + (value.length === 1 ? ',' : '') + ')' : '[' + body + ']';
      }
      return '{' + pythonObjectKeys(value).map(key => repr(key) + ': ' + repr((value as ConfigRecord)[key], value, key, active)).join(', ') + '}';
    } finally { active.delete(value); }
  }
  const text = String(value), quote = text.includes("'") && !text.includes('"') ? '"' : "'";
  return quote + [...text].map(char => {
    if (char === '\\' || char === quote) return '\\' + char;
    if (char === '\n') return '\\n'; if (char === '\r') return '\\r'; if (char === '\t') return '\\t';
    if (char !== ' ' && /[\p{C}\p{Z}]/u.test(char)) {
      const n = char.codePointAt(0)!;
      return '\\' + (n <= 255 ? 'x' : n <= 65535 ? 'u' : 'U') + n.toString(16).padStart(n <= 255 ? 2 : n <= 65535 ? 4 : 8, '0');
    }
    return char;
  }).join('') + quote;
}
function configuredString(value: unknown, owner?: object, key?: string): string {
  if (value instanceof Date) return pythonDateIso(value).replace('T', ' ');
  return typeof value === 'string' ? value : repr(value, owner, key);
}
/** Required string-key subscription used by Planner's configuration contract. */
export function requiredConfigValue(record: any, key: string): any {
  if (Array.isArray(record)) throw new TypeError('list indices must be integers or slices, not str');
  if (record instanceof Uint8Array) throw new TypeError('byte indices must be integers or slices, not str');
  if (typeof record === 'string') throw new TypeError("string indices must be integers, not 'str'");
  if (record === null || typeof record !== 'object' || record instanceof Date || record instanceof Set) throw new TypeError(`'${configuredType(record)}' object is not subscriptable`);
  return requiredField(record, key);
}
function requiredField(record: ConfigRecord, key: string): unknown {
  if (!configuredHas(record, key)) throw Object.assign(new Error(repr(key)), { name: 'KeyError' });
  return configuredGet(record, key);
}
export function resolveBuilderProfile(cfg: ConfigRecord, requested?: string, env: NodeJS.ProcessEnv = process.env): ResolvedProfile {
  const configuredBuilder = configuredGet(cfg, 'builder');
  const builder = pythonBool(configuredBuilder) ? configuredBuilder : {};
  const id = requested || configuredGet(builder, 'default_profile');
  const configuredProfiles = configuredGet(builder, 'profiles');
  const profiles = pythonBool(configuredProfiles) ? configuredProfiles : {};
  if (!id || !configuredHas(profiles, id)) throw configurationError(`unknown builder profile ${repr(id)}; choices: ${profileChoices(profiles)}`);
  const raw = configuredDict(configuredGet(profiles, id));
  const missing = ['model', 'api_key_env', 'adapter', 'reasoning_effort', 'vision_input'].filter(key => !configuredHas(raw, key));
  if (missing.length) throw configurationError(`builder profile ${repr(id)} missing: ${missing.join(', ')}`);
  const adapter = configuredString(configuredGet(raw, 'adapter'), raw, 'adapter').toLowerCase();
  if (!['responses', 'chat', 'messages'].includes(adapter)) throw configurationError(`builder profile ${repr(id)} has invalid adapter ${repr(adapter)}`);
  const baseUrl = (pythonBool(configuredGet(raw, 'base_url_env')) ? env[configuredString(configuredGet(raw, 'base_url_env'), raw, 'base_url_env')] : '') || configuredGet(raw, 'base_url');
  if (!pythonBool(baseUrl)) throw configurationError(`builder profile ${repr(id)} has no base_url`);
  const configuredDefaults = configuredGet(cfg, 'model');
  const defaults = pythonBool(configuredDefaults) ? configuredDefaults : {};
  return {
    id: configuredString(id), model: configuredString(configuredGet(raw, 'model'), raw, 'model'), base_url: configuredString(baseUrl, raw, 'base_url'), api_key_env: configuredString(configuredGet(raw, 'api_key_env'), raw, 'api_key_env'), adapter,
    reasoning_effort: configuredString(configuredGet(raw, 'reasoning_effort'), raw, 'reasoning_effort'), vision_input: pythonBool(configuredGet(raw, 'vision_input')),
    http_timeout_sec: configuredInteger(pythonBool(configuredGet(raw, 'http_timeout_sec')) ? configuredGet(raw, 'http_timeout_sec') : configuredGet(defaults, 'http_timeout_sec'), 900),
    max_output_tokens: configuredMaxTokens(raw, defaults),
    request_options: configuredDict(configuredGet(raw, 'request_options')), replay_reasoning: pythonBool(configuredGet(raw, 'replay_reasoning') === undefined ? adapter === 'chat' : configuredGet(raw, 'replay_reasoning')),
  };
}
export function defaultModelProfile(cfg = loadConfig()): ResolvedProfile {
  const source = pythonBool(cfg) ? cfg : loadConfig();
  const raw = requiredField(source, 'model') as ConfigRecord;
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    const name = raw == null ? 'NoneType' : Array.isArray(raw) ? 'list' : typeof raw === 'boolean' ? 'bool' : typeof raw === 'number' ? Number.isInteger(raw) ? 'int' : 'float' : 'str';
    throw Object.assign(new Error(`'${name}' object has no attribute 'get'`), { name: 'AttributeError' });
  }
  const adapter = configuredString([configuredGet(raw, 'adapter'), configuredGet(raw, 'wire_api'), 'responses'].find(pythonBool), raw, pythonBool(configuredGet(raw, 'adapter')) ? 'adapter' : 'wire_api').toLowerCase();
  return {
    id: 'default', model: configuredString(requiredField(raw, 'name'), raw, 'name'), base_url: configuredString(requiredField(raw, 'base_url'), raw, 'base_url'), api_key_env: configuredString(requiredField(raw, 'api_key_env'), raw, 'api_key_env'), adapter,
    reasoning_effort: configuredString(pythonBool(configuredGet(raw, 'reasoning_effort')) ? configuredGet(raw, 'reasoning_effort') : 'medium', raw, 'reasoning_effort'), vision_input: pythonBool(configuredGet(raw, 'vision_input') === undefined ? true : configuredGet(raw, 'vision_input')),
    http_timeout_sec: configuredInteger(configuredGet(raw, 'http_timeout_sec'), 900), max_output_tokens: configuredMaxTokens(raw),
    request_options: configuredDict(configuredGet(raw, 'request_options')), replay_reasoning: pythonBool(configuredGet(raw, 'replay_reasoning') === undefined ? adapter === 'chat' : configuredGet(raw, 'replay_reasoning')),
  };
}
export function workflowProfiles(cfg: ConfigRecord, defaultProfile: ResolvedProfile, uniform = false, env: NodeJS.ProcessEnv = process.env): Record<string, ResolvedProfile> {
  let overrides: ConfigRecord = {};
  if (!uniform) {
    const builder = configuredGet(cfg, 'builder');
    const configured = configuredGet(pythonBool(builder) ? builder : {}, 'workflow_profiles');
    if (pythonBool(configured)) overrides = configured;
  }
  // Match set(overrides): mappings iterate keys, strings/list values iterate items.
  if ((typeof overrides !== 'object' && typeof overrides !== 'string') || overrides instanceof Date) throw new TypeError(`'${configuredType(overrides)}' object is not iterable`);
  const keys: any[] = Array.isArray(overrides) || typeof overrides === 'string' || overrides instanceof Set || overrides instanceof Uint8Array ? Array.from(overrides as Iterable<any>) : configuredKeys(overrides);
  const unique = new TypedYamlMap();
  for (const key of keys) {
    requireHashable(key);
    if (!unique.has(key)) unique.set(key, key);
  }
  const unknown = [...unique.values()].filter(key => !(PAGE_WORKFLOWS as readonly string[]).includes(key)).sort(compareKeys);
  if (unknown.length) throw configurationError(`workflow_profiles names unknown workflows: [${unknown.map(value => repr(value)).join(', ')}]`);
  const cache = new TypedYamlMap([[defaultProfile.id, defaultProfile]]);
  return Object.fromEntries(PAGE_WORKFLOWS.map(name => {
    const id = configuredGet(overrides, name, defaultProfile.id);
    requireHashable(id);
    if (!cache.has(id)) cache.set(id, resolveBuilderProfile(cfg, id, env));
    return [name, cache.get(id)!];
  }));
}
