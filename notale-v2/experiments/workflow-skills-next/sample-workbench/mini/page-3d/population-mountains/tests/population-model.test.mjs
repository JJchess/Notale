import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const context = vm.createContext({ window:{} });
const source = fs.readFileSync(new URL(
  "../candidate/pages/assets/population-data.js", import.meta.url
), "utf8");
vm.runInContext(source, context);
const data = context.window.POPULATION_DATA;

assert.equal(data.dataset, "GHS-POP R2023A");
assert.equal(data.epoch, 2020);
assert.deepEqual([data.sourceWindow.width, data.sourceWindow.height], [93, 65]);
assert.equal(data.cellCount, 4732);
assert.equal(data.cells.length, 4732);
assert.equal(new Set(data.cells.map(([id]) => id)).size, 4732);

const total = data.cells.reduce((sum, cell) => sum + cell[3], 0);
const peak = data.cells.reduce((highest, cell) => cell[3] > highest[3] ? cell : highest);
assert.equal(total, 14807951);
assert.deepEqual(Array.from(peak), [data.peak.id, 50, 34, 50299]);
assert.equal(data.maxPopulation / 2500, 20.1196);

const columns = Array(93).fill(0);
data.cells.forEach(([, column, , population]) => {
  columns[column] = Math.max(columns[column], population);
});
assert.equal(columns.length, 93);
assert.equal(Math.max(...columns), 50299);
assert.equal(columns.indexOf(50299), 50);

console.log(JSON.stringify({
  passed:true, cells:data.cells.length, uniqueIds:4732, total,
  peak:{ id:peak[0], column:peak[1], row:peak[2], population:peak[3] },
  peakElevation:20.1196, fallbackColumns:columns.length
}, null, 2));
