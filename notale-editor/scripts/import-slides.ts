import {readFile} from 'node:fs/promises';
const filename = process.argv[2];
if (!filename || !filename.toLowerCase().endsWith('.notale')) throw Error('Usage: npm run import:slides -- lecture.notale');
const origin = process.env.EDITOR_URL ?? 'http://127.0.0.1:4310';
const response = await fetch(origin + '/api/import', {method:'POST',headers:{'content-type':'application/octet-stream'},body:new Uint8Array(await readFile(filename))});
if (!response.ok) throw Error(`${response.status}: ${await response.text()}`);
const result = await response.json();
console.log(JSON.stringify({id:result.document.id,version:result.version,slides:result.document.slides.length,url:`${origin}/?document=${result.document.id}`},null,2));
