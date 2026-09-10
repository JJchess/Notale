<sample id="iconography-lens" category="general" variant="mini">
  <file path="samples/general/iconography-lens/mini/pages/index.html">
```html
<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>读懂一幅神像</title><link rel="stylesheet" href="style.css"><script type="module" src="app.js"></script><main><header><a href="../../../../../../index.html" target="_top">← Samples</a><span>AZTEC ICONOGRAPHY / THE PUDDING</span></header><div class="intro"><h1>读懂一幅神像</h1><p>从完整插画走近一个细节，看形象如何承载象征。<br>点击主题或前后翻阅，保留原作全部讲解。</p></div><div class="switch" role="group" aria-label="选择插画"><button data-god="tlalte" aria-pressed="true">01 · Tlaltecuhtli</button><button data-god="tezca" aria-pressed="false">02 · Tezcatlipoca</button></div><section class="workspace"><figure><svg id="art" viewBox="0 0 5320 5320" role="img" aria-labelledby="art-title"><title id="art-title"></title><defs><mask id="lens"><rect width="5320" height="5320" fill="white" fill-opacity="0.1"></rect><g id="windows"></g></mask></defs><image id="painting" x="0" y="0" width="5320" height="5320" mask="url(#lens)"></image><g id="rings" fill="none" stroke="#e1120a" stroke-width="40"></g></svg><figcaption id="source"></figcaption><button id="whole" aria-pressed="false">暂看完整插画</button></figure><aside><div class="eyebrow"><span id="god-name"></span><output id="count"></output></div><h2 id="title"></h2><div id="copy" lang="en"></div><div class="navigation"><button id="prev">← 上一项</button><button id="next">下一项 →</button></div><nav id="topics" aria-label="图像讲解主题"></nav><small>图像与英文讲解：Gwendal Uguen<br>原作交互：Luc Guillemot</small></aside></section><footer><a href="https://pudding.cool/2022/06/aztec-gods/">原作与参考文献 ↗</a><a href="SAMPLE.md">来源与复核记录</a><span>已审阅入库</span></footer></main><link rel="stylesheet" href="mini-scrollbars.css"></html>
```
  </file>
  <file path="samples/general/iconography-lens/mini/pages/app.js">
```javascript
import{tlaltePositions,tezcaPositions}from'./positions.js';const $=id=>document.getElementById(id),ns='http://www.w3.org/2000/svg';let god='tlalte',index=0,whole=false,doc;const config={tlalte:{name:'Tlaltecuhtli',image:'Tlaltecuhtli-explorable.png',positions:tlaltePositions},tezca:{name:'Tezcatlipoca',image:'tezca-explorable.png',positions:tezcaPositions}};const names={intro:'整体',colors:'颜色',face:'面部',spear:'投矛',shield:'盾牌',headdress:'头饰',foot:'脚',satchel:'香囊',pectoral:'胸饰',nose:'鼻饰',ezpitzal:'缺席的符号',claws:'爪',hair:'头发',mouth:'嘴',extramouths:'关节与骷髅',crouch:'蹲姿'};
function mask(){const c=config[god],step=doc[god+'-steps'][index];$('painting').setAttribute('mask',whole?'':'url(#lens)');$('rings').style.display=whole?'none':'';$('whole').textContent=whole?'回到局部讲解':'暂看完整插画';$('whole').setAttribute('aria-pressed',String(whole));const positions=c.positions[step.id].filter(p=>p.rx>0);for(const target of ['windows','rings']){const group=$(target);while(group.children.length>positions.length)group.lastElementChild.remove();positions.forEach((p,i)=>{let e=group.children[i];if(!e){e=document.createElementNS(ns,'ellipse');group.append(e)}for(const a of ['cx','cy','rx','ry'])e.setAttribute(a,p[a]*5320);if(target==='windows')e.setAttribute('fill','white')})}}
function render(){$('copy').scrollTop=0;whole=false;const c=config[god],steps=doc[god+'-steps'],step=steps[index];document.querySelectorAll('[data-god]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.god===god)));$('painting').setAttribute('href','assets/'+c.image);$('art-title').textContent=c.name+' — '+names[step.id];$('god-name').textContent=c.name;$('count').textContent=`${String(index+1).padStart(2,'0')} / ${steps.length}`;$('title').textContent=names[step.id]+(step.title?' / '+step.title:'');$('copy').innerHTML=step.text.replaceAll('/2022/06/aztec-gods/assets/img/','assets/');$('source').replaceChildren();const sourceLabel=doc['source_'+god+'_label'],sourceUrl=doc['source_'+god+'_url'];if(sourceUrl){const a=document.createElement('a');a.href=sourceUrl;a.textContent=sourceLabel;$('source').append(a)}else $('source').textContent=sourceLabel;$('prev').disabled=index===0;$('next').disabled=index===steps.length-1;const nav=$('topics');nav.replaceChildren();steps.forEach((s,i)=>{const b=document.createElement('button');b.textContent=names[s.id];b.dataset.step=s.id;if(i===index)b.setAttribute('aria-current','step');b.onclick=()=>{index=i;render();$('topics').querySelector(`[data-step="${s.id}"]`).focus({preventScroll:true})};nav.append(b)});mask()}
for(const b of document.querySelectorAll('[data-god]'))b.onclick=()=>{god=b.dataset.god;index=0;render()};$('prev').onclick=()=>{if(index>0){index--;render()}};$('next').onclick=()=>{if(index<doc[god+'-steps'].length-1){index++;render()}};$('whole').onclick=()=>{whole=!whole;mask()};fetch('source-doc.json').then(r=>r.json()).then(d=>{doc=d;render();document.body.dataset.ready='true'}).catch(e=>{$('copy').textContent='讲解加载失败，请刷新重试';console.error(e)});
```
  </file>
  <file path="samples/general/iconography-lens/mini/pages/style.css">
```css
*{box-sizing:border-box}body{margin:0;background:#ffe39c;color:#29271f;font-family:Arial,"PingFang SC",sans-serif}main{max-width:1440px;padding:30px 48px;margin:auto}header,footer{display:flex;justify-content:space-between;gap:20px;font-size:11px}a{color:inherit;text-underline-offset:4px}header{padding-bottom:25px;border-bottom:1px solid #bca868}.intro{display:flex;align-items:center;justify-content:space-between;gap:30px;margin:30px 0}h1{font:500 48px Georgia,"Songti SC",serif;margin:0}.intro p{font-size:13px;line-height:1.8;color:#665c3c}.switch{display:flex;gap:12px;margin-bottom:25px}button{font:inherit;color:inherit;cursor:pointer;border:1px solid #b3a16a;background:transparent;padding:12px 16px}.switch button{font-size:14px;letter-spacing:1px}.switch button[aria-pressed=true]{background:#29271f;color:#fff0c9;border-color:#29271f}.workspace{display:grid;grid-template-columns:minmax(0,1.6fr) minmax(300px,1fr);gap:56px;align-items:center}figure{margin:0}svg{width:100%;display:block;overflow:visible}figcaption{font-size:10px;font-style:italic;text-align:center;line-height:1.6;min-height:30px;color:#665c3c}#whole{display:block;margin:16px auto;font-size:11px}#whole[aria-pressed=true]{background:#fff0c9}.eyebrow{display:flex;justify-content:space-between;font-size:11px;letter-spacing:1px;border-bottom:1px solid #bca868;padding-bottom:16px}h2{font-size:32px;font-weight:500;margin:28px 0 20px}#copy{font-family:Georgia,serif;font-size:21px;line-height:1.6;min-height:165px}#copy img{width:42px;height:31px;vertical-align:middle}.navigation{display:flex;justify-content:space-between;gap:15px;margin:24px 0 32px}.navigation button{font-size:12px}button:disabled{opacity:.3;cursor:default}#topics{display:flex;gap:8px;flex-wrap:wrap;border-top:1px solid #bca868;padding-top:22px}#topics button{padding:8px 10px;font-size:12px}#topics button[aria-current=step]{border-color:#e1120a;color:#b00;background:#fff0c9}aside small{display:block;font-size:10px;line-height:1.8;margin-top:30px;color:#665c3c}footer{border-top:1px solid #bca868;padding-top:24px;margin-top:40px}button:hover:not(:disabled){background:#fff0c9;color:#29271f}button:focus-visible{outline:3px solid #e1120a;outline-offset:3px}@media(max-width:800px){main{padding:24px}.intro{display:block}h1{font-size:38px}.switch button{padding:11px 8px;font-size:12px}.workspace{grid-template-columns:1fr;gap:20px}figure{max-width:600px;margin:auto}.intro p{margin-top:18px}#copy{font-size:18px;min-height:95px}h2{font-size:28px;margin:20px 0 15px}header span{max-width:130px;text-align:right;font-size:9px}footer{flex-wrap:wrap}}
ellipse{transition:cx 700ms,cy 700ms,rx 700ms,ry 700ms}@media(prefers-reduced-motion:reduce){ellipse{transition:none}}

/* Full artwork and its lens remain visible beside the selected explanation. */
@media(min-width:1200px) and (min-height:700px){
 main{height:900px;max-width:1600px;display:grid;grid-template-rows:30px 64px 44px minmax(0,1fr) 36px;gap:12px;padding:24px 40px}
 header{padding-bottom:12px}.intro{margin:0}h1{font-size:38px}.switch{margin:0}.switch button{padding:8px 16px}
 .workspace{min-height:0;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:56px;align-items:stretch}
 figure{height:100%;min-height:0;display:flex;flex-direction:column;align-items:center}#art{width:550px;height:550px;max-width:100%;flex:none}figcaption{min-height:20px}#whole{margin:8px auto;padding:8px 14px}
 aside{min-height:0;display:grid;grid-template-rows:32px 64px minmax(0,1fr) 42px auto 42px;gap:12px}.eyebrow{padding-bottom:12px}h2{margin:0;align-self:center}#copy{min-height:0;overflow:auto;font-size:20px;overscroll-behavior:contain}.navigation{margin:0}.navigation button{padding:8px 16px}#topics{padding-top:12px}aside small{margin:0}
 footer{margin:0;padding-top:12px}
}
```
  </file>
  <file path="samples/general/iconography-lens/mini/pages/positions.js">
```javascript
// Positions of masks on the explorable images
// as percentage of width for cx and rx,
// as percentage of height for cy and ry

export const tezcaPositions = {
  intro: [
    {
      cx: 0.5,
      cy: 0.5,
      rx: 0.49,
      ry: 0.49
    }
  ],
  colors: [
    {
      cx: 0.5,
      cy: 0.5,
      rx: 0.49,
      ry: 0.49
    }
  ],
  face: [
    {
      cx: 0.3,
      cy: 0.4,
      rx: 0.112,
      ry: 0.112
    }
  ],
  spear: [
    {
      cx: 0.74,
      cy: 0.25,
      rx: 0.085,
      ry: 0.085
    }
  ],
  shield: [
    {
      cx: 0.768,
      cy: 0.44,
      rx: 0.122,
      ry: 0.122
    }
  ],
  headdress: [
    {
      cx: 0.338,
      cy: 0.31,
      rx: 0.33,
      ry: 0.17
    }
  ],
  foot: [
    {
      cx: 0.3,
      cy: 0.83,
      rx: 0.085,
      ry: 0.085
    }
  ],
  satchel: [
    {
      cx: 0.17,
      cy: 0.73,
      rx: 0.11,
      ry: 0.11
    }
  ],
  pectoral: [
    {
      cx: 0.424,
      cy: 0.594,
      rx: 0.082,
      ry: 0.082
    }
  ],
  nose: [
    {
      cx: 0.267,
      cy: 0.48,
      rx: 0.038,
      ry: 0.038
    }
  ],
  ezpitzal: [
    {
      cx: 0.5,
      cy: 0.5,
      rx: 0.49,
      ry: 0.49
    }
  ]
};

export const tlaltePositions = {
  intro: [
    {
      cx: 0.5,
      cy: 0.5,
      rx: 0.49,
      ry: 0.49
    }
  ],
  claws: [
    {
      cx: 0.89,
      cy: 0.25,
      rx: 0.1,
      ry: 0.1
    },
    {
      cx: 0.87,
      cy: 0.75,
      rx: 0.13,
      ry: 0.1
    }
  ],
  hair: [
    {
      cx: 0.5,
      cy: 0.41,
      rx: 0.295,
      ry: 0.13
    }
  ],
  mouth: [
    {
      cx: 0.5,
      cy: 0.26,
      rx: 0.3295,
      ry: 0.17
    }
  ],
  extramouths: [
    {
      cx: 0.5,
      cy: 0.58,
      rx: 0.13,
      ry: 0.13
    },
    {
      cx: 0.26,
      cy: 0.68,
      rx: 0.07,
      ry: 0.07
    },
    {
      cx: 0.74,
      cy: 0.68,
      rx: 0.07,
      ry: 0.07
    },
    {
      cx: 0.1,
      cy: 0.5,
      rx: 0.12,
      ry: 0.12
    },
    {
      cx: 0.9,
      cy: 0.5,
      rx: 0.12,
      ry: 0.12
    }
  ],
  crouch: [
    {
      cx: 0.5,
      cy: 0.653,
      rx: 0.485,
      ry: 0.285
    }
  ]
};
```
  </file>
  <file path="samples/general/iconography-lens/mini/pages/mini-scrollbars.css">
```css
/* Local scrollbars inherit the surrounding ink, including light/dark themes. */
@supports selector(::-webkit-scrollbar) {
  * { scrollbar-width: auto !important; scrollbar-color: auto !important; }
  *::-webkit-scrollbar { width: 8px !important; height: 8px !important; }
  *::-webkit-scrollbar-track, *::-webkit-scrollbar-corner { background: transparent !important; }
  *::-webkit-scrollbar-thumb {
    background: #8888 !important;
    background: color-mix(in srgb, currentColor 28%, transparent) !important;
    border: 2px solid transparent !important;
    border-radius: 999px !important;
    background-clip: padding-box !important;
    min-height: 28px !important;
    min-width: 28px !important;
  }
  *::-webkit-scrollbar-thumb:hover {
    background-color: color-mix(in srgb, currentColor 46%, transparent) !important;
  }
  *::-webkit-scrollbar-thumb:active {
    background-color: color-mix(in srgb, currentColor 62%, transparent) !important;
  }
}
@supports not selector(::-webkit-scrollbar) {
  * { scrollbar-width: thin !important; scrollbar-color: #8888 transparent !important; }
  @supports (color: color-mix(in srgb, black, transparent)) {
    * { scrollbar-color: color-mix(in srgb, currentColor 28%, transparent) transparent !important; }
    *:hover, *:focus-visible { scrollbar-color: color-mix(in srgb, currentColor 46%, transparent) transparent !important; }
  }
}
@media (forced-colors: active) {
  * { scrollbar-width: auto !important; scrollbar-color: auto !important; }
  *::-webkit-scrollbar-thumb { background: ButtonText !important; }
}
```
  </file>
  <omitted path="../../../../../../index.html">Navigation back to the formal sample gallery.</omitted>
  <omitted path="SAMPLE.md">Local source attribution and approval record; not part of the rendering algorithm.</omitted>
</sample>
