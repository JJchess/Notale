import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

const root=new URL("../candidate/pages/",import.meta.url);
const report=JSON.parse(await readFile(new URL("../report.json",import.meta.url),"utf8"));
const names=["index.html","styles.css","mechanism.js"];
const files=await Promise.all(names.map(name=>readFile(new URL(name,root),"utf8")));
const chars=files.map(file=>[...file].length);
assert.equal(chars.reduce((sum,value)=>sum+value,0),report.mini_chars);
assert.ok(files.every(file=>file.split(/\r?\n/).every(line=>[...line].length<=400)));
assert.match(files[2],/for\(let index=0;index<15;index\+\+\)/);
assert.match(files[2],/TorusGeometry\(1\.72.*ConeGeometry\(\.23/s);
assert.match(files[2],/pallets\.push\(pallet\)/);
assert.match(files[2],/TubeGeometry\(curve,180,\.027,7,false\)/);
assert.match(files[2],/Math\.PI\*2\/15/);
assert.match(files[2],/\["wheel","fork","balance"\]/);
assert.match(files[2],/root\.traverse/);
assert.match(files[2],/forceContextLoss/);
assert.match(files[0],/pathLength="30" stroke-dasharray="1 1"/);

const reused=["assets/base.css","assets/base.js","assets/lib/three.min.js"];
const hashes=[];
for(const path of reused){
  const data=await readFile(new URL(path,root));
  hashes.push(createHash("sha256").update(data).digest("hex"));
}
assert.deepEqual(hashes,[
  "a10166ac9e1b6f82981fab9dffbfea56b09b873cf615daa1811c7b13a061f367",
  "1d82ad5f561ee21163b61c4c55e13e0ab76fa04b404916db7c83df00b9f84faa",
  "170c6789f43217c96b3170f4b42fafe135de7f7cd48497a4218f9757ee1d49fa"
]);
console.log(JSON.stringify({passed:true,authorChars:report.mini_chars,fileChars:chars,teeth:15,states:4},null,2));
