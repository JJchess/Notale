/** Read an explicit header + category/value table copied from a spreadsheet. */
export function parseChartSpreadsheet(text: string) {
  if (text.length > 200_000) throw new Error('数据过大，请限制为 100 个分类、8 个系列');
  text = text.replace(/^\uFEFF/, '');
  let quoted = false, delimiter = ',';
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === '"') {
      if (quoted && text[i + 1] === '"') i++;
      else quoted = !quoted;
    } else if (!quoted && char === '\t') { delimiter = '\t'; break; }
    else if (!quoted && (char === '\r' || char === '\n')) break;
  }
  const rows: string[][] = [];
  let row: string[] = [], field = '', inQuote = false, closed = false;
  const cell = () => { row.push(field); field = ''; closed = false; };
  const endRow = () => { cell(); rows.push(row); row = []; if (rows.length > 102) throw new Error('最多支持 100 个分类'); };
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (inQuote) {
      if (char === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else { inQuote = false; closed = true; }
      } else field += char;
    } else if (char === delimiter) cell();
    else if (char === '\r' || char === '\n') {
      endRow(); if (char === '\r' && text[i + 1] === '\n') i++;
    } else if (char === '"' && !field && !closed) inQuote = true;
    else {
      if (closed || char === '"') throw new Error('引号格式不完整，请粘贴完整的表格区域');
      field += char;
    }
  }
  if (inQuote) throw new Error('引号未闭合，请粘贴完整的表格区域');
  if (field || row.length || closed) endRow();
  if (rows.length < 2) throw new Error('需要一行系列名称，以及至少一行分类和数值');
  const header = rows.shift()!;
  if (header.length < 2 || header.length > 9 || rows.length > 100)
    throw new Error('支持 1–100 个分类、1–8 个系列；第一列为分类');
  if (header.slice(1).some(name => !name.trim())) throw new Error('第一行的每个系列都需要名称');
  const labels: string[] = [];
  const series = header.slice(1).map(name => ({ name: name.trim(), values: [] as number[] }));
  rows.forEach((cells, r) => {
    if (cells.length !== header.length) throw new Error(`第 ${r + 2} 行列数不一致`);
    if (!cells[0].trim()) throw new Error(`第 ${r + 2} 行缺少分类名称`);
    labels.push(cells[0].trim());
    series.forEach((item, s) => {
      const raw = cells[s + 1].trim();
      const grouped = /^[+-]?\d{1,3}(?:,\d{3})+(?:\.\d*)?(?:e[+-]?\d+)?$/i.test(raw);
      const value = grouped ? raw.replace(/,/g, '') : raw;
      if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(value) || !Number.isFinite(Number(value)))
        throw new Error(`第 ${r + 2} 行第 ${s + 2} 列需要数字；不支持公式或百分号，千位分隔需每组三位`);
      item.values.push(Number(value));
    });
  });
  return { labels, series };
}
