(async()=>{
const copy=await fetch('copy.json').then(r=>r.json());
await clothingChart.init();
const buttons=[...document.querySelectorAll('nav button')],items=[...document.querySelectorAll('.clothes__item')];
function step(index){d3.selectAll('.clothes__item').interrupt();clothingChart.setStep(index);buttons.forEach((b,i)=>b.setAttribute('aria-pressed',i===index));document.querySelector('#explanation').innerHTML='<p>'+copy.clothesSteps[index].text+'</p>';document.body.dataset.step=index;if(matchMedia('(prefers-reduced-motion: reduce)').matches){d3.selectAll('.clothes__item').interrupt();items.forEach(el=>{const d=el.__data__;el.style.backgroundColor=index===4?(d.market==='f'?'#0976DC':d.market==='m'?'#158A36':'#FFFFFF'):'#FFFFFF';el.style.color=index===4&&d.market!=='n'?'#FFFFFF':'#282828';});}}
buttons.forEach((b,i)=>b.addEventListener('click',()=>step(i)));
const market={f:'girls',m:'boys',n:'any gender'};
function select(el){items.forEach(x=>x.setAttribute('aria-pressed',x===el));const d=el.__data__;document.querySelector('#item-detail').textContent=`${d.slug} · ${d.n} of 481 schools (${d.per}%). Marketed to ${market[d.market]}. ${d.reveal_body==='y'?'Classified as revealing or accentuating the body.':'One of the four items not classified as revealing or accentuating the body.'}`;}
items.forEach(el=>{el.tabIndex=0;el.setAttribute('role','button');el.setAttribute('aria-pressed','false');el.setAttribute('aria-label',`${el.__data__.slug}: ${el.__data__.per}% of schools. Show details`);el.addEventListener('click',()=>select(el));el.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();select(el);}});});
document.querySelector('#short-notes').innerHTML=copy.clothingNotesText;
step(0);document.body.dataset.ready='true';
})().catch(e=>{document.querySelector('#item-detail').textContent='The original chart data could not be loaded. Reload to try again.';console.error(e)});
