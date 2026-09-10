/** CSV/TSV parsing for the chart data surface. Quoted multiline cells remain intact. */
export function readDelimitedRows(text:string):string[][] {
  if(text.length>4_000_000)throw Error('表格超过 4 MB');text=text.replace(/^\uFEFF/,'');
  const delimiter=text.split(/\r?\n/,1)[0].includes('\t')?'\t':',';
  const rows:string[][]=[];let row:string[]=[],field='',quoted=false;
  for(let i=0;i<text.length;i++){const c=text[i];if(c==='"'){if(quoted&&text[i+1]==='"'){field+='"';i++;}else quoted=!quoted;}else if(!quoted&&(c===delimiter||c==='\n'||c==='\r')){row.push(field);field='';if(c!==delimiter){rows.push(row);row=[];if(c==='\r'&&text[i+1]==='\n')i++;}}else field+=c;if(rows.length>20001||row.length>100)throw Error('最多支持 20000 行、100 列');}
  if(quoted)throw Error('引号未闭合');if(field||row.length){row.push(field);rows.push(row);}return rows;
}
