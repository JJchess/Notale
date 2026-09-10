import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root=new URL("../candidate/pages/",import.meta.url);
const html=await readFile(new URL("index.html",root),"utf8");
const css=await readFile(new URL("styles.css",root),"utf8");
const script=await readFile(new URL("solar-storage.js",root),"utf8");
assert.match(script,/\["h00",0,36,0\]/);
assert.match(script,/\["h14",14,64,88\]/);
assert.match(script,/\["h20",20,78,25\]/);
assert.equal((script.match(/\["h\d{2}",/g)||[]).length,13);
assert.match(script,/dataset:\{dimensions:\["id","hour","demand","solar"\]/);
assert.match(script,/renderer:"svg"/);
assert.match(script,/crossing\(records\[5\],records\[6\]\)/);
assert.match(html,/id="surplus"/);assert.match(html,/id="gap"/);assert.match(html,/id="transferFlow"/);
assert.match(script,/observer\.disconnect/);assert.match(script,/cancelAnimationFrame/);assert.match(script,/chart\.dispose/);
const chars=[html,css,script].reduce((sum,file)=>sum+[...file].length,0);
assert.equal(chars,9986);assert.ok(chars<10000);
console.log(JSON.stringify({passed:true,authorChars:chars,records:13,states:3},null,2));
