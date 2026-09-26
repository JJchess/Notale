/** Arithmetic only. No identifiers, function calls, property access or eval. */
export function numericExpression(source: string): number {
  const input = source.trim();
  if (!input || input.length > 160) throw Error("请输入有效数值");
  let cursor = 0;
  const space = () => {
    while (/\s/.test(input[cursor] ?? "") && cursor < input.length) cursor++;
  };
  function primary(): number {
    space();
    const next = input[cursor];
    if (next === "+" || next === "-") {
      cursor++;
      return (next === "-" ? -1 : 1) * primary();
    }
    if (next === "(") {
      cursor++;
      const value = sum();
      space();
      if (input[cursor++] !== ")") throw Error("请补全括号");
      return value;
    }
    const match = /^(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?/i.exec(
      input.slice(cursor),
    );
    if (!match) throw Error("请输入数值或简单算式");
    cursor += match[0].length;
    return Number(match[0]);
  }
  function product(): number {
    let value = primary();
    for (;;) {
      space();
      const op = input[cursor];
      if (op !== "*" && op !== "/") return value;
      cursor++;
      const right = primary();
      if (op === "/" && right === 0) throw Error("不能除以零");
      value = op === "*" ? value * right : value / right;
    }
  }
  function sum(): number {
    let value = product();
    for (;;) {
      space();
      const op = input[cursor];
      if (op !== "+" && op !== "-") return value;
      cursor++;
      const right = product();
      value = op === "+" ? value + right : value - right;
    }
  }
  const value = sum();
  space();
  if (cursor !== input.length || !Number.isFinite(value))
    throw Error("请输入有限数值或简单算式");
  return Number(value.toPrecision(12));
}
export function boundedNumber(source: string, min?: number, max?: number) {
  const value = numericExpression(source);
  if (min !== undefined && value < min) throw Error(`数值不能小于 ${min}`);
  if (max !== undefined && value > max) throw Error(`数值不能大于 ${max}`);
  return value;
}
