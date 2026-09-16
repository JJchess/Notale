import {diagramTheme} from './diagram-theme.js';
/** Small, legible previews of the structures inserted by smartArt in templates.ts. */
export function diagramPreview(kind:'process'|'list'|'cycle') {
  const {ink,accent,soft,border}=diagramTheme;
  const text=(x:number,y:number,value:string,size=10)=>`<text x="${x}" y="${y}" fill="${ink}" font-size="${size}" font-family="system-ui,sans-serif" text-anchor="middle">${value}</text>`;
  let content='';
  if(kind==='process')content=[14,87,160].map((x,i)=>`<path d="M${x} 29H${x+52}L${x+68} 56L${x+52} 83H${x}L${x+14} 56Z" fill="${soft}" stroke="${border}" stroke-width="1"/>${text(x+35,52,`步骤${['一','二','三'][i]}`,11)}<path d="M${x+23} 64h24" stroke="${accent}" stroke-opacity=".45" stroke-width="2" stroke-linecap="round"/>`).join('');
  if(kind==='list')content=[15,45,75].map((y,i)=>`<rect x="28" y="${y}" width="184" height="23" rx="5" fill="white" stroke="${border}"/><circle cx="44" cy="${y+11.5}" r="7.5" fill="${accent}"/><text x="44" y="${y+14.5}" text-anchor="middle" fill="white" font-family="system-ui,sans-serif" font-size="9">${i+1}</text><path d="M63 ${y+9}h${[86,107,72][i]}" stroke="${ink}" stroke-opacity=".7" stroke-width="2.5" stroke-linecap="round"/><path d="M63 ${y+15}h${[115,86,100][i]}" stroke="${border}" stroke-width="2" stroke-linecap="round"/>`).join('');
  if(kind==='cycle'){
    content=`<g fill="none" stroke="${accent}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M139 22C169 27 183 45 177 68m-5-5 5 5 5-5"/><path d="M162 88C141 104 103 104 82 88m7 0h-7v7"/><path d="M63 67C56 44 73 25 99 22m-5-4 5 4-5 5"/></g>`;
    for(const [x,y,label] of [[94,9,'阶段一'],[146,69,'阶段二'],[42,69,'阶段三']] as const)content+=`<rect x="${x}" y="${y}" width="52" height="24" rx="12" fill="${soft}" stroke="${border}"/>${text(x+26,y+16,label)}`;
  }
  return `<svg class="diagram-preview" viewBox="0 0 240 112" aria-hidden="true" focusable="false">${content}</svg>`;
}
