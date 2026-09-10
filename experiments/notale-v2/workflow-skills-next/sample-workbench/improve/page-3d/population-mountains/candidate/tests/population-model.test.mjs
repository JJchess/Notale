import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const context = vm.createContext({ window:{} });
const source = fs.readFileSync(new URL("../pages/assets/population-data.js", import.meta.url), "utf8");
vm.runInContext(source, context);

const data = context.window.POPULATION_DATA;
const ELEVATION_SCALE = 2500;
const { width, height } = data.sourceWindow;
const centerX = (width - 1) / 2;
const centerZ = (height - 1) / 2;

assert.equal(data.dataset, "GHS-POP R2023A");
assert.equal(data.epoch, 2020);
assert.equal(data.crs, "ESRI:54009");
assert.equal(data.cellSizeMeters, 1000);
assert.equal(width, 93);
assert.equal(height, 65);
assert.equal(data.cellCount, 4732);
assert.equal(data.cells.length, data.cellCount);

const ids = new Set();
const columns = Array(width).fill(0);
let totalPopulation = 0;
let highestCell;

for (const cell of data.cells) {
  const [id, column, row, population] = cell;
  assert.equal(ids.has(id), false, `duplicate stable cell id: ${id}`);
  ids.add(id);
  assert.ok(Number.isInteger(column) && column >= 0 && column < width, `${id} column`);
  assert.ok(Number.isInteger(row) && row >= 0 && row < height, `${id} row`);
  assert.ok(Number.isInteger(population) && population > 0, `${id} population`);
  totalPopulation += population;
  columns[column] = Math.max(columns[column], population);
  if (!highestCell || population > highestCell[3]) highestCell = cell;
}

assert.equal(totalPopulation, 14807951);
assert.equal(totalPopulation, data.totalPopulation);
assert.deepEqual(Array.from(highestCell), [data.peak.id, data.peak.column, data.peak.row, data.maxPopulation]);
assert.equal(data.maxPopulation, 50299);
assert.equal(Math.max(...columns), data.maxPopulation);
assert.equal(columns.indexOf(data.maxPopulation), data.peak.column);

const peakElevation = data.maxPopulation / ELEVATION_SCALE;
assert.equal(peakElevation, 20.1196);
assert.equal(data.peak.column - centerX, 4);
assert.equal(peakElevation / 2, 10.0598);
assert.equal(data.peak.row - centerZ, 2);
assert.ok(Math.abs(peakElevation + .4 - 20.5196) < Number.EPSILON * 100);

console.log(JSON.stringify({
  status:"PASS",
  dataset:data.dataset,
  epoch:data.epoch,
  grid:[width, height],
  cells:data.cells.length,
  uniqueIds:ids.size,
  totalPopulation,
  peak:{ id:data.peak.id, population:data.maxPopulation, column:data.peak.column, row:data.peak.row },
  elevationScale:ELEVATION_SCALE,
  peakElevation,
  fallbackColumns:columns.length
}, null, 2));
