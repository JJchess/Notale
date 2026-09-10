import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import vm from "node:vm";

const dataUrl = new URL("../pages/assets/data/", import.meta.url);
const read = name => fs.readFileSync(new URL(name, dataUrl));
const context = vm.createContext({ window:{} });
vm.runInContext(read("cities-screen.js").toString(), context);
vm.runInContext(read("climate-grid.js").toString(), context);

const cities = context.window.CLIMATE_CITIES;
const packed = context.window.CLIMATE_GRID_RLE;
const screenJson = JSON.parse(read("cities-screen.json"));
const geojson = JSON.parse(read("final_cities_v2.geojson"));
const metadata = JSON.parse(read("climate-grid.meta.json"));
const sha256 = value => crypto.createHash("sha256").update(value).digest("hex");
const clean = value => value.replace(/\s+/g, " ").trim();

assert.equal(cities.length, 70);
assert.deepEqual(JSON.parse(JSON.stringify(cities)), screenJson);
assert.equal(new Set(cities.map(city => clean(city.name))).size, 70);
assert.equal(geojson.features.length, 70);

const subclassChanges = cities.filter(city => city.clim_2023 !== city.clim_2070).length;
const majorChanges = cities.filter(city => clean(city.type_2023_simp) !== clean(city.type_2070_simp)).length;
const coldPresent = cities.filter(city => clean(city.type_2023_simp) === "Cold").length;
const coldFuture = cities.filter(city => clean(city.type_2070_simp) === "Cold").length;
assert.equal(subclassChanges, 45);
assert.equal(majorChanges, 31);
assert.deepEqual([coldPresent, coldFuture], [16, 1]);

const MAP_W = 1584;
const MAP_H = 900;
assert.deepEqual([packed.width, packed.height], [MAP_W, MAP_H]);

function expand(rows) {
  assert.equal(rows.length, MAP_H);
  const values = new Uint8Array(MAP_W * MAP_H);
  rows.forEach((row, y) => {
    assert.equal(row.length % 3, 0);
    for (let run = 0; run < row.length; run += 3) {
      const [x, length, category] = row.slice(run, run + 3);
      assert.ok(Number.isInteger(x) && x >= 0 && x < MAP_W);
      assert.ok(Number.isInteger(length) && length > 0 && x + length <= MAP_W);
      assert.ok(Number.isInteger(category) && category >= 0 && category <= 30);
      values.fill(category, y * MAP_W + x, y * MAP_W + x + length);
    }
  });
  return values;
}

const present = expand(packed.present);
const future = expand(packed.future);
assert.equal(sha256(present), "06a720c888484b0406a754554face3bb73c0deba27be4041332361f08bc02345");
assert.equal(sha256(future), "79ce4478b1abd69b2a5c0e153bb93c8e01a10131b88c48bd77c7cf6575210950");
assert.equal(Object.values(metadata.cell_counts.present).filter(Number).length, 31);

const screenByName = new Map(cities.map(city => [clean(city.name), city]));
const projectionErrors = [];

function naturalEarth(longitude, latitude) {
  const lambda = longitude * Math.PI / 180;
  const phi = latitude * Math.PI / 180;
  const phi2 = phi * phi;
  const phi4 = phi2 * phi2;
  const x = lambda * (0.8707 - 0.131979 * phi2 + phi4 * phi4 * phi4 *
    (-0.013791 + phi2 * (0.003971 * phi2 - 0.001529 * phi4)));
  const y = phi * (1.007226 + phi2 *
    (0.015085 + phi4 * (-0.044475 + 0.028874 * phi2 - 0.005916 * phi4)));
  return [792.1181901144718 + 300.2534121448773 * x, 450.0005585915445 - 300.82036333324055 * y];
}

for (const feature of geojson.features) {
  const city = screenByName.get(clean(feature.properties.name));
  assert.ok(city, feature.properties.name);
  const [x, y] = naturalEarth(...feature.geometry.coordinates);
  projectionErrors.push([x - city.x, y - city.y]);
}

const rms = axis => Math.sqrt(projectionErrors.reduce((sum, error) => sum + error[axis] ** 2, 0) / projectionErrors.length);
const maxProjectionError = Math.max(...projectionErrors.map(([x, y]) => Math.hypot(x, y)));
assert.ok(rms(0) < .7 && rms(1) < .01 && maxProjectionError < 2.2);
assert.equal(sha256(read("final_cities_v2.geojson")), "193e0f371907f5e869cf88735982458b553a46018e5b25da70a7de80d3e95b59");

console.log(JSON.stringify({
  status:"PASS",
  cities:cities.length,
  subclassChanges,
  majorChanges,
  cold:[coldPresent, coldFuture],
  grid:[MAP_W, MAP_H],
  expandedGridHashes:{ present:sha256(present), future:sha256(future) },
  projectionRms:[rms(0), rms(1)],
  maxProjectionError,
  geojsonSha256:sha256(read("final_cities_v2.geojson"))
}, null, 2));
