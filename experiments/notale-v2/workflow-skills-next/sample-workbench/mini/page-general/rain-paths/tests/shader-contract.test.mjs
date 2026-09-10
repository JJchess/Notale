import assert from "node:assert/strict";
import fs from "node:fs";

const mini = fs.readFileSync(new URL("../candidate/pages/rain-paths.js", import.meta.url), "utf8");
const full = fs.readFileSync(new URL("../../../../../build-page/samples/general/rain-paths/pages/rain-paths.js", import.meta.url), "utf8");
const shader = (source, name) => source.match(new RegExp("const " + name + " = `([\\s\\S]*?)`;"))[1];

assert.equal(shader(mini, "vertexShader"), shader(full, "vertexShader"));
assert.equal(shader(mini, "fragmentShader"), shader(full, "fragmentShader"));
assert.match(mini, /01-asphalt|surfaceTexture/);

console.log(JSON.stringify({
  passed:true,
  vertexChars:shader(mini, "vertexShader").length,
  fragmentChars:shader(mini, "fragmentShader").length,
  exactFullShader:true
}, null, 2));
