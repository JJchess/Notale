import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

const root=new URL("../candidate/pages/",import.meta.url);
const names=["index.html","styles.css","visual.js"];
const files=await Promise.all(names.map(name=>readFile(new URL(name,root),"utf8")));
const chars=files.map(file=>[...file].length);
assert.equal(chars.reduce((sum,value)=>sum+value,0),9999);
assert.ok(files.every(file=>file.split(/\r?\n/).every(line=>[...line].length<=400)));
assert.match(files[0],/a=σ\(Σxᵢwᵢ\+b\)/);
assert.match(files[2],/SEED=20250815/);
assert.match(files[2],/\[4,204,83,-54,6\].*\[2\.3,214,464,48,6\]/s);
assert.match(files[2],/x"\+\(index\+1\)/);
assert.match(files[2],/trunk\.id\+":w"\+\(index\+1\)/);
assert.match(files[2],/AbortController/);
assert.match(files[2],/autofit\.stop/);

const reused=["assets/base.css","assets/base.js"];
const hashes=[];
for(const path of reused){
  const data=await readFile(new URL(path,root));
  hashes.push(createHash("sha256").update(data).digest("hex"));
}
assert.deepEqual(hashes,[
  "a10166ac9e1b6f82981fab9dffbfea56b09b873cf615daa1811c7b13a061f367",
  "1d82ad5f561ee21163b61c4c55e13e0ab76fa04b404916db7c83df00b9f84faa"
]);
console.log(JSON.stringify({passed:true,authorChars:9999,fileChars:chars,seed:20250815,states:4},null,2));
