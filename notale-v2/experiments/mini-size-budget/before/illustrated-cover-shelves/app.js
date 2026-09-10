const $=s=>document.querySelector(s),data=await fetch('data.json').then(r=>r.json()),view=$('#viewport'),shelves=$('#shelves'),dialog=$('#reader'),lookup=new Map(data.books.map(b=>[b.isbn,b])),nodes=new Map(),groups=new Map(),storageKey='pudding-illustrated-reading-list-v1',small=matchMedia('(max-width:700px)'),reduced=matchMedia('(prefers-reduced-motion:reduce)');let pendingScroll=null;let year=2018,mode='detail',detailBook=null,opener=null,toastTimer,raf;let saved=new Set();try{const value=JSON.parse(localStorage.getItem(storageKey)||'[]');if(Array.isArray(value))saved=new Set(value.filter(v=>lookup.has(v)))}catch{}
function el(tag,cls,text){const e=document.createElement(tag);if(cls)e.className=cls;if(text!==undefined)e.textContent=text;return e}
function img(b){const i=el('img');i.src=b.src;i.alt=b.title;i.loading='lazy';return i}
function notify(message){clearTimeout(toastTimer);$('#status').textContent=message;toastTimer=setTimeout(()=>$('#status').textContent='',2200)}
function sync(){for(const [isbn,n]of nodes){const yes=saved.has(isbn),button=n.querySelector('.add');button.setAttribute('aria-pressed',yes);button.textContent=yes?'✓':'+';button.setAttribute('aria-label',(yes?'从清单移除 ':'加入清单 ')+lookup.get(isbn).title)}$('#list-count').textContent=saved.size;try{localStorage.setItem(storageKey,JSON.stringify([...saved]))}catch{}}
function toggle(isbn){if(saved.has(isbn)){saved.delete(isbn);notify('已从阅读清单移除')}else{saved.add(isbn);notify('已加入阅读清单')}sync()}
for(const b of data.books){const n=el('div','book');n.dataset.isbn=b.isbn;const cover=el('button','cover');cover.setAttribute('aria-label','查看 '+b.title);cover.append(img(b));cover.onclick=()=>openDetail(b,cover);const add=el('button','add');add.onclick=()=>toggle(b.isbn);n.append(cover,add);nodes.set(b.isbn,n)}
function build(){shelves.replaceChildren();groups.clear();const rowCount=4;for(const y of data.years){const group=el('section','year-group');group.dataset.year=y.year;group.setAttribute('aria-label',y.year+' 年');group.append(el('span','year-marker',y.year));const books=data.books.filter(b=>b.year===y.year);const cols=Math.ceil(books.length/rowCount);for(let r=0;r<rowCount;r++){const row=el('div','row');row.style.width=`calc(var(--book-w) * ${cols} + 8px)`;books.forEach((b,i)=>{if(i%rowCount===r)row.append(nodes.get(b.isbn))});group.append(row)}shelves.append(group);groups.set(y.year,group)}pad();go(year,false)}
for(const y of data.years){const btn=el('button');btn.dataset.year=y.year;btn.setAttribute('aria-label',`${y.year} 年，${y.percent}%，${y.count} 本插画封面 / ${y.total} 本`);const bar=el('span','bar');bar.style.setProperty('--pct',y.percent);bar.append(el('span','',y.percent+'%'));btn.append(bar,el('span','year-label',y.year));btn.onclick=()=>go(y.year);$('#chart').append(btn)}
function pad(){shelves.style.paddingRight=Math.max(10,view.clientWidth-groups.get(2023).offsetWidth+10)+'px'}
addEventListener('resize',()=>{pad();go(year,false)});
function update(y){year=y;const d=data.years.find(d=>d.year===y);$('#year-label').textContent=y;$('#percent').textContent=d.percent+'%';$('#denominator').textContent=d.count+' 本插画封面 / '+d.total+' 本样本';$('#year').value=y;$('#previous-year').disabled=y===2011;$('#next-year').disabled=y===2023;$('#chart').querySelectorAll('button').forEach(b=>b.setAttribute('aria-current',+b.dataset.year===y));window.shelfDebug={year:y,count:data.books.length,saved:[...saved]}}
function go(y,animate=true){
 y=Math.max(2011,Math.min(2023,y));update(y);
 const left=Math.max(0,Math.min(view.scrollWidth-view.clientWidth,groups.get(y).offsetLeft-10));
 pendingScroll={year:y,left};
 view.scrollTo({left,behavior:animate&&!reduced.matches?'smooth':'instant'});
}
view.addEventListener('scroll',()=>{
 cancelAnimationFrame(raf);
 raf=requestAnimationFrame(()=>{
  if(pendingScroll){
   if(Math.abs(view.scrollLeft-pendingScroll.left)<2){update(pendingScroll.year);pendingScroll=null}
   return;
  }
  let visibleYear=2011;
  for(const [yr,group]of groups)if(group.offsetLeft<=view.scrollLeft+18)visibleYear=yr;
  update(visibleYear);
 });
},{passive:true});
for(const event of ['pointerdown','wheel'])view.addEventListener(event,()=>{pendingScroll=null},{passive:true});
addEventListener('pagehide',()=>{cancelAnimationFrame(raf);clearTimeout(toastTimer)},{once:true});
$('#year').oninput=e=>go(+e.target.value,false);$('#previous-year').onclick=()=>go(year-1);$('#next-year').onclick=()=>go(year+1);small.addEventListener('change',build);
function openDetail(b,button){mode='detail';detailBook=b;opener=button;$('#dialog-title').textContent='封面与书目';const body=$('#dialog-body');body.replaceChildren();const detail=el('div','detail');const photo=img(b);photo.loading='eager';const text=el('div');text.append(el('h3','',b.title),el('p','',b.author),el('p','',b.year+' · '+b.publisher),el('p','','ISBN '+b.isbn));const save=el('button','',saved.has(b.isbn)?'从清单移除':'加入阅读清单');save.onclick=()=>{toggle(b.isbn);save.textContent=saved.has(b.isbn)?'从清单移除':'加入阅读清单'};text.append(save);detail.append(photo,text);body.append(detail);show()}
function renderList(){const body=$('#dialog-body');body.replaceChildren();$('#dialog-title').textContent='阅读清单 · '+saved.size;const tools=el('div','list-tools');const download=el('button','','下载 CSV');download.id='download';download.disabled=!saved.size;download.onclick=()=>{const q=v=>'"'+String(v).replace(/"/g,'""')+'"';const rows=[['ISBN','title','author','year'],...[...saved].map(id=>{const b=lookup.get(id);return [b.isbn,b.title,b.author,b.year]})];const blob=new Blob(['\ufeff'+rows.map(r=>r.map(q).join(',')).join('\r\n')],{type:'text/csv;charset=utf-8'});const url=URL.createObjectURL(blob),a=el('a');a.href=url;a.download='illustrated-reading-list.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)};const clear=el('button','','清空清单');clear.id='clear-list';clear.disabled=!saved.size;clear.onclick=()=>{saved.clear();sync();renderList();$('#close').focus()};tools.append(download,clear);body.append(tools);if(!saved.size)body.append(el('p','empty','清单还是空的。回到书架，点击 ＋ 收藏封面。'));for(const isbn of saved){const b=lookup.get(isbn),row=el('div','list-row');row.dataset.isbn=isbn;const text=el('div');text.append(el('h3','',b.title),el('p','',b.author+' · '+b.year));const remove=el('button','','移除');remove.onclick=()=>{toggle(isbn);renderList();$('#close').focus()};row.append(img(b),text,remove);body.append(row)}}
function show(){dialog.showModal();document.body.style.overflow='hidden';$('#close').focus()}
$('#open-list').onclick=()=>{mode='list';opener=$('#open-list');renderList();show()};$('#close').onclick=()=>dialog.close();dialog.addEventListener('close',()=>{document.body.style.overflow='';opener?.focus({preventScroll:true})});build();sync();update(year);
