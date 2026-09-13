export type TableItem = {
  id: string;
  tag: string;
  parent?: string;
  html: string;
  locked: boolean;
};
export interface TableCell {id:string;row:number;column:number;rowSpan:number;colSpan:number;text:string;editable:boolean;group:number;}
export function selectedTable(objects:TableItem[],selected:string[]){
 let object=selected.length===1?objects.find(o=>o.id===selected[0]):undefined;const seen=new Set<string>();
 while(object&&object.tag!=='table'){if(seen.has(object.id))return;seen.add(object.id);object=objects.find(o=>o.id===object?.parent);}return object;
}
export function tableCells(html:string,objects:TableItem[]){
      const source = new DOMParser()
        .parseFromString(html, "text/html")
        .querySelector("table")!;
      const cells:TableCell[] = [];
      const occupied: string[][] = [];
      const rows = [...source.rows];
      rows.forEach((row, r) => {
        occupied[r] ??= [];
        let c = 0;
        const end = rows.findIndex(
          (later, i) => i > r && later.parentElement !== row.parentElement,
        );
        const groupEnd = end < 0 ? rows.length : end;
        for (const cell of row.cells) {
          while (occupied[r][c]) c++;
          const id = cell.getAttribute("data-notale-id")!;
          const rowSpan =
              cell.rowSpan === 0
                ? groupEnd - r
                : Math.min(cell.rowSpan, groupEnd - r),
            colSpan = cell.colSpan;
          cells.push({
            id,
            row: r,
            column: c,
            rowSpan,
            colSpan,
            text: cell.textContent ?? "",
            group: rows.findIndex(
              (other) => other.parentElement === row.parentElement,
            ),
            editable:
              cell.children.length === 0 &&
              !objects.find((o) => o.id === id)?.locked,
          });
          for (let y = r; y < r + rowSpan; y++) {
            occupied[y] ??= [];
            for (let x = c; x < c + colSpan; x++) occupied[y][x] = id;
          }
          c += colSpan;
        }
      });
 return {cells,columns:Math.max(1,...occupied.map(row=>row.length))};
}
  export function tableRegion(cells:TableCell[],chosen:string,rangeEnd:string,objects:TableItem[]) {
    const start = cells.find((cell) => cell.id === chosen),
      end = cells.find((cell) => cell.id === rangeEnd) ?? start;
    if (!start || !end)
      return {
        row: 0,
        column: 0,
        rowSpan: 1,
        colSpan: 1,
        picked: [],
        valid: false,
      };
    const row = Math.min(start.row, end.row),
      column = Math.min(start.column, end.column),
      bottom = Math.max(start.row + start.rowSpan, end.row + end.rowSpan),
      right = Math.max(start.column + start.colSpan, end.column + end.colSpan);
    const picked = cells.filter(
      (cell) =>
        cell.row < bottom &&
        cell.row + cell.rowSpan > row &&
        cell.column < right &&
        cell.column + cell.colSpan > column,
    );
    const valid =
      picked.every(
        (cell) =>
          cell.row >= row &&
          cell.row + cell.rowSpan <= bottom &&
          cell.column >= column &&
          cell.column + cell.colSpan <= right &&
          cell.group === start.group &&
          !objects.find((o) => o.id === cell.id)?.locked,
      ) &&
      picked.reduce((sum, cell) => sum + cell.rowSpan * cell.colSpan, 0) ===
        (bottom - row) * (right - column);
    return {
      row,
      column,
      rowSpan: bottom - row,
      colSpan: right - column,
      picked,
      valid,
    };
  }
