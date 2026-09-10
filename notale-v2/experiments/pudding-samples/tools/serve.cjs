const http=require('http'),fs=require('fs'),path=require('path');
const root=path.resolve(__dirname,'..'),formal=path.resolve(root,'../../workflows'),port=Number(process.env.PUDDING_REVIEW_PORT||41991);
const mime={'.html':'text/html; charset=utf-8','.css':'text/css','.js':'text/javascript','.mjs':'text/javascript','.json':'application/json','.md':'text/plain; charset=utf-8','.png':'image/png','.webp':'image/webp','.woff2':'font/woff2','.woff':'font/woff','.ttf':'font/ttf','.svg':'image/svg+xml','.jpg':'image/jpeg','.jpeg':'image/jpeg','.gif':'image/gif','.mp4':'video/mp4','.webm':'video/webm','.mp3':'audio/mpeg','.wav':'audio/wav','.csv':'text/csv; charset=utf-8','.pdf':'application/pdf'};
http.createServer((req,res)=>{try{
 const relative=decodeURIComponent(req.url.split('?')[0]);
 if(relative.split('/').some(p=>p.startsWith('.'))||relative.startsWith('/sources')){res.writeHead(403).end();return}
 const legacy=relative.match(/^\/review\/([^/]+)(?:\/(?:index\.html)?)?$/);
 if(legacy){const row=JSON.parse(fs.readFileSync(path.join(root,'catalog.json'))).candidates.find(r=>r.id===legacy[1]&&r.promoted&&r.formal_entry);if(row){const workflow=row.formal_entry.replace(/^workflows\//,'').split('/')[0],sample=JSON.parse(fs.readFileSync(path.join(formal,workflow,'samples/catalog.json'))).samples.find(r=>r.id===row.id);res.writeHead(302,{Location:'/formal/'+workflow+'/'+sample.mini.root+'/index.html'+(req.url.includes('?')?req.url.slice(req.url.indexOf('?')):'')}).end();return}}
 const mounted=relative==='/formal'||relative.startsWith('/formal/'),base=mounted?formal:root,part=mounted?(relative.slice(7)||'/'):relative;let file=path.resolve(base,'.'+part);
 if(!(file===base||file.startsWith(base+path.sep))){res.writeHead(403).end();return}
 if(fs.statSync(file).isDirectory())file=path.join(file,'index.html');res.setHeader('Content-Type',mime[path.extname(file)]||'text/plain');fs.createReadStream(file).pipe(res);
 }catch{res.writeHead(404).end('Not found')}
}).listen(port,'0.0.0.0',()=>console.log(`Pudding samples: http://localhost:${port}/formal/`));
