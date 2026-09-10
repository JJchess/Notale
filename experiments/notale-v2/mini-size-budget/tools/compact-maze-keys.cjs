const fs=require('fs');
module.exports=async function(page,dir){
 let source=fs.readFileSync('experiments/mini-size-budget/combined/state-maze-stories/assets/mini-icons.svg','utf8');
 let symbols=await page.evaluate(svg=>{let d=new DOMParser().parseFromString(svg,'image/svg+xml');return[3,4,5,6].map(i=>d.getElementById('i'+i).innerHTML)},source);
 for(let i=0;i<4;i++)fs.writeFileSync('experiments/mini-size-budget/combined/state-maze-stories/assets/key'+i+'.svg','<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#34373e" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">'+symbols[i]+'</svg>');
};
