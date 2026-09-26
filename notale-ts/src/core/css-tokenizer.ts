/** Component tokenizer ported from tinycss2 1.5.1.
 * Copyright 2013-2020 Simon Sapin and contributors; BSD-3-Clause.
 * License: resources/licenses/tinycss2-LICENSE. Representation serialization is separate.
 */
export interface CssComponent {
  representation?: string; prelude?: CssComponent[]; at_keyword?: string;
  type: string; source_line: number; source_column: number;
  value?: string | number | CssComponent[]; important?: boolean; name?: string; unit?: string;
  int_value?: number | null; is_identifier?: boolean; start?: number; end?: number;
  kind?: string; message?: string; content?: CssComponent[] | null; arguments?: CssComponent[];
}
const nameStart = (c: string | undefined) => c !== undefined && (/^[a-zA-Z_]$/.test(c) || c.codePointAt(0)! > 127);
const nameChar = (c: string | undefined) => nameStart(c) || (c !== undefined && /^[0-9-]$/.test(c));
const white = (c: string | undefined) => c !== undefined && ' \n\t'.includes(c);
const hex = (c: string | undefined) => c !== undefined && /^[0-9a-fA-F]$/.test(c);

export function cssComponents(source: string, skipComments = false): CssComponent[] {
  // Code-point indexing preserves Python source columns, including astral text.
  const chars = [...source.replaceAll('\0', '\uFFFD').replace(/\r\n|[\r\f]/g, '\n')];
  const length = chars.length;
  let pos = 0, previous = 0, line = 1, lastNewline = -1;
  const slice = (start: number, end = length) => chars.slice(start, end).join('');
  const at = (text: string, offset = pos) => slice(offset, offset + text.length) === text;
  const identStart = (offset: number): boolean => nameStart(chars[offset]) ||
    (chars[offset] === '-' && (nameStart(chars[offset + 1]) || chars[offset + 1] === '-' || (chars[offset + 1] === '\\' && chars[offset + 2] !== '\n'))) ||
    (chars[offset] === '\\' && chars[offset + 1] !== '\n');
  const escape = (): string => {
    let digits = '';
    while (digits.length < 6 && hex(chars[pos])) digits += chars[pos++];
    if (digits) {
      if (white(chars[pos])) pos++;
      const code = parseInt(digits, 16);
      return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : '\uFFFD';
    }
    return pos < length ? chars[pos++]! : '\uFFFD';
  };
  const ident = (): string => {
    let value = '';
    while (pos < length) {
      if (nameChar(chars[pos])) value += chars[pos++];
      else if (chars[pos] === '\\' && chars[pos + 1] !== '\n') { pos++; value += escape(); }
      else break;
    }
    return value;
  };
  type Consumed = { value: string | null; error?: [string, string] };
  const quoted = (): Consumed => {
    const quote = chars[pos++]; let value = '';
    while (pos < length) {
      const c = chars[pos]!;
      if (c === quote) { pos++; return { value }; }
      if (c === '\n') return { value: null, error: ['bad-string', 'Bad string token'] };
      if (c === '\\') {
        pos++;
        if (pos < length) { if (chars[pos] === '\n') pos++; else value += escape(); }
      } else { value += c; pos++; }
    }
    return { value, error: ['eof-in-string', 'EOF in string'] };
  };
  const url = (): Consumed => {
    while (white(chars[pos])) pos++;
    let value = '', invalid = false;
    while (pos < length) {
      const c = chars[pos]!;
      if (c === ')') { pos++; return { value }; }
      if (white(c)) {
        while (white(chars[pos])) pos++;
        if (pos === length && !invalid) return { value, error: ['eof-in-url', 'EOF in URL'] };
        if (chars[pos] === ')') { pos++; return { value }; }
        break;
      }
      if (c === '\\' && chars[pos + 1] !== '\n') { pos++; value += escape(); }
      else if (/^["'(\x00-\x08\x0b\x0e-\x1f\x7f]$/.test(c)) { pos++; invalid = true; break; }
      else { value += c; pos++; }
    }
    if (pos === length && !invalid) return { value, error: ['eof-in-url', 'EOF in URL'] };
    while (pos < length) {
      if (at('\\)')) pos += 2;
      else if (chars[pos++] === ')') break;
    }
    return { value: null, error: ['bad-url', 'bad URL token'] };
  };
  const root: CssComponent[] = [];
  let tokens = root, endChar: string | undefined;
  const stack: Array<[CssComponent[], string | undefined]> = [];
  while (pos < length) {
    for (let index = previous; index < pos; index++) if (chars[index] === '\n') { line++; lastNewline = index; }
    previous = pos;
    const column = pos - lastNewline, c = chars[pos]!;
    const emit = (type: string, fields: Partial<CssComponent> = {}) => tokens.push({ type, source_line: line, source_column: column, ...fields });
    const error = (item: Consumed) => { if (item.error) emit('error', { kind: item.error[0], message: item.error[1] }); };
    const block = (type: string, end: string, name?: string) => {
      const children: CssComponent[] = [];
      emit(type, name === undefined ? { content: children } : { name, arguments: children });
      stack.push([tokens, endChar]); tokens = children; endChar = end;
    };
    if (white(c)) { const start = pos++; while (white(chars[pos])) pos++; emit('whitespace', { value: slice(start, pos) }); }
    else if ('Uu'.includes(c) && chars[pos + 1] === '+' && (hex(chars[pos + 2]) || chars[pos + 2] === '?')) {
      pos += 2; const limit = Math.min(pos + 6, length); let digits = '', questions = 0;
      while (pos < limit && hex(chars[pos])) digits += chars[pos++];
      while (pos < limit && chars[pos] === '?') { questions++; pos++; }
      let end = digits;
      if (questions) { end += 'F'.repeat(questions); digits += '0'.repeat(questions); }
      else if (chars[pos] === '-' && hex(chars[pos + 1])) { pos++; end = ''; while (end.length < 6 && hex(chars[pos])) end += chars[pos++]; }
      emit('unicode-range', { start: parseInt(digits, 16), end: parseInt(end, 16) });
    } else if (at('-->')) { emit('literal', { value: '-->' }); pos += 3; }
    else if (identStart(pos)) {
      const value = ident();
      if (chars[pos] !== '(') emit('ident', { value });
      else {
        pos++; let next = pos; while (white(chars[next])) next++;
        if (value.toLowerCase() === 'url' && chars[next] !== '"' && chars[next] !== "'") {
          const item = url(); if (item.value !== null) emit('url', { value: item.value, representation: 'url(' + serializeUrl(item.value) + (item.error ? '' : ')') }); error(item);
        } else block('function', ')', value);
      }
    } else {
      const number = slice(pos).match(/^[-+]?(?:[0-9]*\.)?[0-9]+(?:[eE][+-]?[0-9]+)?/);
      if (number) {
        const text = number[0]; pos += text.length;
        const fields = { representation: text, value: Number(text), int_value: /[.eE]/.test(text) ? null : Number(text) || 0 };
        if (pos < length && identStart(pos)) emit('dimension', { ...fields, unit: ident() });
        else if (chars[pos] === '%') { pos++; emit('percentage', fields); }
        else emit('number', fields);
      } else if (c === '@') { pos++; if (pos < length && identStart(pos)) emit('at-keyword', { value: ident() }); else emit('literal', { value: '@' }); }
      else if (c === '#') {
        pos++;
        if (pos < length && (nameChar(chars[pos]) || (chars[pos] === '\\' && chars[pos + 1] !== '\n'))) {
          const is_identifier = identStart(pos); emit('hash', { value: ident(), is_identifier });
        } else emit('literal', { value: '#' });
      } else if ('{[('.includes(c)) { pos++; block(c === '{' ? '{} block' : c === '[' ? '[] block' : '() block', ({ '{': '}', '[': ']', '(': ')' } as Record<string, string>)[c]!); }
      else if (c === endChar) { [tokens, endChar] = stack.pop()!; pos++; }
      else if ('}])'.includes(c)) { emit('error', { kind: c, message: 'Unmatched ' + c }); pos++; }
      else if (c === '"' || c === "'") { const item = quoted(); if (item.value !== null) emit('string', { value: item.value, representation: '"' + serializeString(item.value) + (item.error ? '' : '"') }); error(item); }
      else if (at('/*')) {
        pos += 2; const start = pos;
        while (pos < length && !at('*/')) pos++;
        if (!skipComments) emit('comment', { value: slice(start, pos) });
        pos = Math.min(length, pos + 2);
      } else if (at('<!--')) { emit('literal', { value: '<!--' }); pos += 4; }
      else if (at('||')) { emit('literal', { value: '||' }); pos += 2; }
      else if ('~|^$*'.includes(c) && chars[pos + 1] === '=') { emit('literal', { value: c + '=' }); pos += 2; }
      else { emit('literal', { value: c }); pos++; }
    }
  }
  return root;
}

export const serializeString = (value: string): string => value.replace(/["\\\n\r\f]/g, c => ({ '"': '\\"', '\\': '\\\\', '\n': '\\A ', '\r': '\\D ', '\f': '\\C ' })[c]!);
const serializeUrl = (value: string): string => [...value].map(c => ({ "'": "\\'", '"': '\\"', '\\': '\\\\', ' ': '\\ ', '\t': '\\9 ', '\n': '\\A ', '\r': '\\D ', '\f': '\\C ', '(': '\\(', ')': '\\)' } as Record<string, string>)[c] ?? c).join('');
const escapeNameChar = (c: string): string => nameChar(c) ? c : ({ '\n': '\\A ', '\r': '\\D ', '\f': '\\C ' } as Record<string, string>)[c] ?? '\\' + c;
export const serializeName = (value: string): string => [...value].map(escapeNameChar).join('');
export function serializeIdentifier(value: string): string {
  if (value === '-') return '\\-';
  if (value.startsWith('--')) return '--' + serializeName(value.slice(2));
  let prefix = '';
  if (value.startsWith('-')) { prefix = '-'; value = value.slice(1); }
  const [first, ...rest] = [...value];
  if (first === undefined) throw new Error('Empty CSS identifier');
  const head = nameStart(first) ? first : /^[0-9]$/.test(first) ? '\\' + first.codePointAt(0)!.toString(16).toUpperCase() + ' ' : escapeNameChar(first);
  return prefix + head + serializeName(rest.join(''));
}
const badPairs = new Set<string>();
for (const [left, right] of [
  [['ident', 'at-keyword', 'hash', 'dimension', '#', '-', 'number'], ['ident', 'function', 'url', 'number', 'percentage', 'dimension', 'unicode-range']],
  [['ident', 'at-keyword', 'hash', 'dimension'], ['-', '-->']],
  [['#', '-', 'number', '@'], ['ident', 'function', 'url']],
  [['unicode-range', '.', '+'], ['number', 'percentage', 'dimension']],
  [['@'], ['ident', 'function', 'url', 'unicode-range', '-']],
  [['unicode-range'], ['ident', 'function', '?']],
  [['$', '*', '^', '~', '|'], ['=']],
  [['ident'], ['() block']], [['|'], ['|']], [['/'], ['*']],
]) for (const a of left!) for (const b of right!) badPairs.add(a + ':' + b);
export function serializeCss(nodes: CssComponent[]): string {
  let output = '', previous = '';
  for (const node of nodes) {
    const type = node.type === 'literal' ? String(node.value) : node.type;
    if (badPairs.has(previous + ':' + type)) output += '/**/';
    else if (previous === '\\' && !(type === 'whitespace' && String(node.value).startsWith('\n'))) output += '\n';
    output += serializeNode(node);
    if (type === 'declaration') output += ';';
    previous = type;
  }
  return output;
}
function serializeNode(node: CssComponent): string {
  const value = String(node.value ?? '');
  switch (node.type) {
    case 'literal': case 'whitespace': return value;
    case 'comment': return '/*' + value + '*/';
    case 'ident': return serializeIdentifier(value);
    case 'at-keyword': return '@' + serializeIdentifier(value);
    case 'hash': return '#' + (node.is_identifier ? serializeIdentifier(value) : serializeName(value));
    case 'string': case 'url': case 'number': return node.representation!;
    case 'percentage': return node.representation + '%';
    case 'dimension': {
      const unit = node.unit!;
      return node.representation + (/^[eE](?:-|$)/.test(unit) ? '\\65 ' + serializeName(unit.slice(1)) : serializeIdentifier(unit));
    }
    case 'unicode-range': return 'U+' + node.start!.toString(16).toUpperCase() + (node.start === node.end ? '' : '-' + node.end!.toString(16).toUpperCase());
    case '{} block': return '{' + serializeCss(node.content!) + '}';
    case '[] block': return '[' + serializeCss(node.content!) + ']';
    case '() block': return '(' + serializeCss(node.content!) + ')';
    case 'function': {
      const result = serializeIdentifier(node.name!) + '(' + serializeCss(node.arguments!);
      let last: CssComponent | undefined = node;
      while (last?.type === 'function' && last.arguments?.length) {
        last = last.arguments.at(-1);
        if (last?.type === 'error' && last.kind === 'eof-in-string') return result;
      }
      return result + ')';
    }
    case 'declaration': return serializeIdentifier(node.name!) + ':' + serializeCss(node.value as CssComponent[]) + (node.important ? '!important' : '');
    case 'qualified-rule': return serializeCss(node.prelude!) + '{' + serializeCss(node.content!) + '}';
    case 'at-rule': return '@' + serializeIdentifier(node.at_keyword!) + serializeCss(node.prelude!) + (node.content ? '{' + serializeCss(node.content) + '}' : ';');
    case 'error':
      if (node.kind === 'bad-string') return '"[bad string]\n';
      if (node.kind === 'bad-url') return 'url([bad url])';
      if (node.kind && [')', ']', '}'].includes(node.kind)) return node.kind;
      if (node.kind === 'eof-in-string' || node.kind === 'eof-in-url') return '';
      throw Object.assign(new Error('Can not serialize <ParseError ' + node.kind + '>'), { name: 'TypeError' });
    default: throw new Error('Unsupported CSS node: ' + node.type);
  }
}

/** tinycss2 parse_stylesheet / parse_rule_list over component values. */
export function cssRules(input: string | CssComponent[], stylesheet = true, skipComments = true, skipWhitespace = true): CssComponent[] {
  const tokens = typeof input === 'string' ? cssComponents(input, skipComments) : input;
  const result: CssComponent[] = [];
  let index = 0;
  while (index < tokens.length) {
    const first = tokens[index++]!;
    if (first.type === 'whitespace') { if (!skipWhitespace) result.push(first); continue; }
    if (first.type === 'comment') { if (!skipComments) result.push(first); continue; }
    if (stylesheet && first.type === 'literal' && ['<!--', '-->'].includes(String(first.value))) continue;
    const position = { source_line: first.source_line, source_column: first.source_column };
    const prelude: CssComponent[] = [];
    if (first.type === 'at-keyword') {
      let content: CssComponent[] | null = null;
      while (index < tokens.length) {
        const token = tokens[index++]!;
        if (token.type === '{} block') { content = token.content!; break; }
        if (token.type === 'literal' && token.value === ';') break;
        prelude.push(token);
      }
      result.push({ type: 'at-rule', ...position, at_keyword: String(first.value), prelude, content });
    } else {
      let last = first, block: CssComponent | undefined;
      if (first.type === '{} block') block = first;
      else {
        prelude.push(first);
        while (index < tokens.length) {
          last = tokens[index++]!;
          if (last.type === '{} block') { block = last; break; }
          prelude.push(last);
        }
      }
      result.push(block ? { type: 'qualified-rule', ...position, prelude, content: block.content! } : {
        type: 'error', source_line: last.source_line, source_column: last.source_column,
        kind: 'invalid', message: 'EOF reached before {} block for a qualified rule.',
      });
    }
  }
  return result;
}

/** tinycss2 parse_blocks_contents: declarations may fall back to nested rules. */
export function cssBlocks(input: string | CssComponent[], skipComments = true, skipWhitespace = true): CssComponent[] {
  const tokens = typeof input === 'string' ? cssComponents(input, skipComments) : input;
  const result: CssComponent[] = [];
  const literal = (token: CssComponent | undefined, value: string) => token?.type === 'literal' && token.value === value;
  let index = 0;
  while (index < tokens.length) {
    const start = index, first = tokens[index++]!;
    if (first.type === 'whitespace') { if (!skipWhitespace) result.push(first); continue; }
    if (first.type === 'comment') { if (!skipComments) result.push(first); continue; }
    if (literal(first, ';')) continue;
    const position = { source_line: first.source_line, source_column: first.source_column };
    if (first.type === 'at-keyword') {
      while (index < tokens.length) { const token = tokens[index++]!; if (literal(token, ';') || token.type === '{} block') break; }
      result.push(cssRules(tokens.slice(start, index), false, false, false)[0]!);
      continue;
    }
    const declaration: CssComponent[] = [];
    if (first.type !== '{} block') while (index < tokens.length) {
      const token = tokens[index++]!;
      if (literal(token, ';')) break;
      declaration.push(token);
      if (token.type === '{} block') break;
    }
    const colon = declaration.findIndex(token => token.type !== 'whitespace' && token.type !== 'comment');
    if (first.type === 'ident' && colon >= 0 && literal(declaration[colon], ':')) {
      const value = declaration.slice(colon + 1);
      let state = 'value', bang = 0, nonWhitespace = false, simpleBlock = false;
      for (const [offset, token] of value.entries()) {
        if (state === 'value' && literal(token, '!')) { state = 'bang'; bang = offset; }
        else if (state === 'bang' && token.type === 'ident' && String(token.value).toLowerCase() === 'important') state = 'important';
        else if (token.type !== 'whitespace' && token.type !== 'comment') {
          state = 'value';
          if (token.type === '{} block') { if (nonWhitespace) simpleBlock = true; else nonWhitespace = true; }
          else nonWhitespace = true;
        }
      }
      if (state === 'important') value.splice(bang);
      if (!(simpleBlock && nonWhitespace)) {
        result.push({ type: 'declaration', ...position, name: String(first.value), value, important: state === 'important' });
        continue;
      }
    }
    // Replay tokens from before the failed declaration parse, as chain() does.
    index = start;
    const prelude: CssComponent[] = [];
    let last = first, block: CssComponent | undefined, stopped = false;
    while (index < tokens.length) {
      last = tokens[index++]!;
      if (literal(last, ';')) { stopped = true; break; }
      if (last.type === '{} block') { block = last; break; }
      prelude.push(last);
    }
    result.push(block ? { type: 'qualified-rule', ...position, prelude, content: block.content! } : {
      type: 'error', source_line: last.source_line, source_column: last.source_column, kind: 'invalid',
      message: (stopped ? 'Stop token' : 'EOF') + ' reached before {} block for a qualified rule.',
    });
  }
  return result;
}
