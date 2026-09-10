// Data: Intro.Bottles.svelte. Rotation: SpinningBottle.svelte, original 8-frame WebP strips.
const wines=[
 {animal:'cat',sprite:'lion',name:'Poppóne',winery:'Antonutti',price:34.99,rating:4.3,description:'The lion led you to Poppóne. This bottle is above the study’s median rating, and above its median price.'},
 {animal:'bird',sprite:'bird',name:'Sauvignon Blanc',winery:'Tomtit',price:22.67,rating:4.1,description:'You picked the songbird. This Tomtit bottle sits below the study’s median price and above its median rating.'},
 {animal:'pig',sprite:'pig',name:'Sus Scrofa',winery:'Pardas',price:20.83,rating:3.6,description:'You picked the pig. Sus Scrofa is less expensive than the study’s median, with a lower rating too.'},
 {animal:'amphibian/reptile',sprite:'frog',name:'Tïn Bianco',winery:'Montesecondo',price:39.99,rating:3.8,description:'You picked the frog. This bottle costs more than the study’s median, while its rating is lower.'}
];
const main=document.querySelector('main'),rack=document.querySelector('.bottles'),prompt=document.querySelector('#prompt'),title=document.querySelector('h1'),reset=document.querySelector('#reset'),result=document.querySelector('#result');
const initial=prompt.textContent;
function select(index){
 const wine=wines[index];main.classList.add('chosen');main.dataset.selected=wine.animal;
 [...rack.children].forEach((button,i)=>{button.classList.remove('entering');button.classList.toggle('selected',i===index);button.tabIndex=i===index?0:-1;button.setAttribute('aria-pressed',i===index);button.querySelector('.sprite').style.backgroundPosition='0 0'});
 title.textContent=wine.name;prompt.textContent=wine.description;
 result.innerHTML=`<div><strong>$${wine.price.toFixed(2)}</strong>Study price</div><div><strong>${wine.rating.toFixed(1)} / 5</strong>Study rating</div><div><strong>$29.99 / 4.0</strong>All-wine medians</div>`;
 result.hidden=false;reset.hidden=false;
}
wines.forEach((wine,i)=>{
 const b=document.createElement('button');b.className='bottle entering';b.style.setProperty('--left',`${20+i*20}%`);b.style.setProperty('--sprite',`url(assets/${wine.sprite}spin.webp)`);b.setAttribute('aria-label',`Choose ${wine.animal}: ${wine.winery} ${wine.name}`);b.setAttribute('aria-pressed','false');
 b.innerHTML=`<span class="sprite" aria-hidden="true"></span><span class="label">${wine.winery}<small>${wine.animal}</small></span>`;
 b.addEventListener('animationend',()=>b.classList.remove('entering'));
 b.addEventListener('pointermove',e=>{if(e.pointerType==='touch')return;const r=b.getBoundingClientRect(),frame=Math.min(4,Math.max(0,Math.floor((e.clientX-r.left)/r.width*5)));b.querySelector('.sprite').style.backgroundPosition=`${(2-frame)*100}% 0`});
 b.addEventListener('pointerleave',()=>b.querySelector('.sprite').style.backgroundPosition='0 0');b.addEventListener('click',()=>select(i));rack.append(b);
});
reset.addEventListener('click',()=>{main.classList.remove('chosen');delete main.dataset.selected;title.textContent='Which label would you pick?';prompt.textContent=initial;result.hidden=true;reset.hidden=true;[...rack.children].forEach(b=>{b.classList.remove('selected');b.tabIndex=0;b.setAttribute('aria-pressed','false')});rack.children[0].focus()});
