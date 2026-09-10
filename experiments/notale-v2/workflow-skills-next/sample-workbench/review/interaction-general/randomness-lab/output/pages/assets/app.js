(function(){
  'use strict';
  var M=window.RandomnessModel,H=window.HUMAN_BASELINE,T=M.theory();
  var $=function(s){return document.querySelector(s)},els={bench:$('.bench'),slots:$('#slots'),phrases:$('#phrases'),count:$('#count'),question:$('#question'),previous:$('#previous'),score:$('#score'),delta:$('#delta'),meaning:$('#meaning'),retry:$('#retry'),undo:$('#undo'),scanner:$('#scanner'),tchart:$('#theory-chart'),hchart:$('#human-chart')};
  function fresh(){return {sequence:'',phase:'build',previous:null,attempt:1}}
  var state=fresh(),maxDensity=Math.max.apply(null,T.bins.map(function(n){return n/T.n}).concat(H.bins.map(function(n){return n/H.n})));
  function transition(s,a){
    if(a.type==='RESET')return fresh();
    if(a.type==='ADD'&&s.phase==='build'&&s.sequence.length<12){var q=s.sequence+a.bit;return {sequence:q,phase:q.length===12?'result':'build',previous:s.previous,attempt:s.attempt}}
    if(a.type==='UNDO'&&s.phase==='build'&&s.sequence)return {sequence:s.sequence.slice(0,-1),phase:'build',previous:s.previous,attempt:s.attempt};
    if(a.type==='RETRY'&&s.phase==='result')return {sequence:'',phase:'build',previous:{sequence:s.sequence,evidence:M.analyze(s.sequence)},attempt:s.attempt+1};
    return s;
  }
  function dispatch(a){var before=state;state=transition(state,a);if(state!==before)render(a.type)}
  function pct(a,x){var lo=0,hi=a.length;while(lo<hi){var m=(lo+hi)>>1;if(a[m]<=x)lo=m+1;else hi=m}return lo/a.length*100}
  function humanPct(x){for(var n=0,i=0;i<T.levels.length&&T.levels[i]<=x+1e-8;i++)n+=H.rankBins[i];return n/H.n*100}
  function fp(x){return x<.1?x.toFixed(2):x.toFixed(1).replace('.0','')}
  function phrases(){
    els.phrases.innerHTML='';if(!state.sequence){els.phrases.innerHTML='<span class="phrase-note">每条横线是一段可复用的增量 LZ 短语</span>';return}
    var start=1;M.factor(state.sequence).forEach(function(p){var d=document.createElement('span');d.className='phrase';d.style.gridColumn=start+'/span '+p.length;d.textContent=p.replace(/1/g,'H').replace(/0/g,'T');d.title='短语 '+p;els.phrases.appendChild(d);start+=p.length});
  }
  function chart(svg,bins,n,median,score,prior,label){
    var w=730,h=82,bw=w/bins.length,out='<line class="axis" x1="10" y1="94" x2="740" y2="94"/>';
    bins.forEach(function(v,i){var bh=v/n/maxDensity*h;out+='<rect class="bar" x="'+(10+i*bw+.6).toFixed(1)+'" y="'+(94-bh).toFixed(1)+'" width="'+(bw-1.2).toFixed(1)+'" height="'+bh.toFixed(1)+'"/>'});
    var mx=10+median/100*w;out+='<line class="median" x1="'+mx+'" y1="9" x2="'+mx+'" y2="96"/>';
    [0,25,50,75,100].forEach(function(v){var x=10+v/100*w;out+='<text class="tick" x="'+x+'" y="112" text-anchor="middle">'+v+'</text>'});
    if(prior!=null){var px=10+prior/100*w;out+='<line class="prior-marker" x1="'+px+'" y1="7" x2="'+px+'" y2="96"/>'}
    if(score!=null){var sx=10+score/100*w;out+='<line class="marker" x1="'+sx+'" y1="4" x2="'+sx+'" y2="96"/><path class="marker-cap" d="M'+(sx-5)+' 4h10l-5 7z"/>'}
    svg.innerHTML=out;svg.setAttribute('aria-label',label+'复杂度分布，中位数 '+median.toFixed(1)+(score==null?'，尚未放置你的序列':'，你的分数 '+score.toFixed(1)));
  }
  function interpret(e,tp,hp){
    var zone=tp<20?'短规则能压缩大部分序列。':tp>80?'它比多数公平硬币样本更难压缩；高分仍不能证明来源。':'它落在公平硬币常见区间；单条 12 位序列不能证明来源。';
    var pattern=e.switches===11?'你每次都换面，而且每隔 2 位完全吻合；这种躲开连续结果的规则很容易复述。':e.switches===0?'整条序列没有换面，一个短句就能复述。':e.lag.match>=.9?'每隔 '+e.lag.p+' 位有 '+Math.round(e.lag.match*100)+'% 吻合，短周期很明显。':e.switches>=8?'你换面 '+e.switches+' 次，像是在躲开连续结果；公平硬币平均换面 5.5 次，人类中位数是 '+H.quantiles.switches[2]+' 次。':e.switches<=3?'你只换面 '+e.switches+' 次，长串重复让序列容易描述。':'没有一个 1-4 位短周期能复述整条序列。';
    return '<b>理论第 '+fp(tp)+' 百分位，人类第 '+fp(hp)+' 百分位。</b> '+zone+pattern;
  }
  function render(cause){
    var q=state.sequence,e=q.length===12?M.analyze(q):null,prior=state.previous&&state.previous.evidence;
    els.slots.innerHTML='';for(var i=0;i<12;i++){var li=document.createElement('li'),bit=q[i];li.className=bit==null?(i===q.length?'current':'empty'):'filled '+(bit==='1'?'head':'tail');li.innerHTML=bit==null?'':(bit==='1'?'正<small>H</small>':'反<small>T</small>');els.slots.appendChild(li)}
    phrases();els.bench.classList.toggle('complete',!!e);els.question.textContent=e?'序列测量完成':state.attempt>1?'换一种策略，再排 12 次':'构造你的序列';els.count.textContent=e?'12 次已完成':'还差 '+(12-q.length)+' 次';
    document.querySelectorAll('[data-bit]').forEach(function(b){b.disabled=!!e});els.undo.disabled=!q||!!e;els.retry.hidden=!e;els.previous.hidden=!state.previous;els.previous.innerHTML=state.previous?'上一轮　<b>'+state.previous.sequence.replace(/1/g,'H ').replace(/0/g,'T ')+'</b>　'+state.previous.evidence.score.toFixed(1)+' 分':'';
    var score=e&&e.score,prevScore=prior&&prior.score;chart(els.tchart,T.bins,T.n,T.quantiles[2],score,prevScore,'公平硬币');chart(els.hchart,H.bins,H.n,H.quantiles.score[2],score,prevScore,'人类作答');
    $('#theory-meta').textContent='4096 个序列 · 中位 '+T.quantiles[2].toFixed(1);$('#human-meta').textContent=H.n.toLocaleString('zh-CN')+' 份 · 中位 '+H.quantiles.score[2].toFixed(1);
    if(e){var tp=pct(T.scores,e.score),hp=humanPct(e.score);els.score.textContent=e.score.toFixed(1)+' / 100';els.delta.textContent=prior?'较上轮 '+(e.score-prior.score>=0?'+':'')+(e.score-prior.score).toFixed(1):'';$('#lz').textContent=e.lz+' / 7 段';$('#blocks').textContent=e.blocks[0]+' / 4 · '+e.blocks[1]+' / 8';$('#structure').textContent=e.switches+' 次换面 · 滞后 '+e.lag.p+' 吻合 '+Math.round(e.lag.match*100)+'%';['lz','block','structure'].forEach(function(k,i){$('#'+k+'bar').style.width=Math.max(0,e.parts[i]*100)+'%'});$('#theory-pos').textContent='第 '+fp(tp)+' 百分位';$('#human-pos').textContent='第 '+fp(hp)+' 百分位';els.meaning.innerHTML=interpret(e,tp,hp);if(cause==='ADD'){els.scanner.classList.remove('run');void els.scanner.offsetWidth;els.scanner.classList.add('run')}}
    else{els.score.textContent=q.length?q.length+' / 12 已输入':'等待序列';els.delta.textContent='';['lz','blocks','structure'].forEach(function(k){$('#'+k).textContent='待计算'});['lz','block','structure'].forEach(function(k){$('#'+k+'bar').style.width='0'});$('#theory-pos').textContent=$('#human-pos').textContent='等待标记';els.meaning.textContent=q.length?'轨道正在按增量 LZ 划分短语。先完成 12 次，再用固定长度的全部可能序列比较。':'公平硬币允许连续出现相同面。输入后，轨道会显示可复用的短语；第 12 次结束时再与两套基准比较。'}
  }
  function key(e){if(e.metaKey||e.ctrlKey||e.altKey||e.repeat)return;var k=e.key.toLowerCase();if(k==='h'||k==='t'){e.preventDefault();dispatch({type:'ADD',bit:k==='h'?'1':'0'})}else if(e.key==='Backspace'){e.preventDefault();dispatch({type:'UNDO'})}}
  document.querySelectorAll('[data-bit]').forEach(function(b){b.addEventListener('click',function(){dispatch({type:'ADD',bit:b.dataset.bit})})});els.undo.addEventListener('click',function(){dispatch({type:'UNDO'})});els.retry.addEventListener('click',function(){dispatch({type:'RETRY'})});$('#reset').addEventListener('click',function(){dispatch({type:'RESET'})});document.addEventListener('keydown',key);Deck.init({keys:false,title:'你能装得像随机吗？'});render();
  window.__RANDOMNESS_LAB__={dispatch:dispatch,getState:function(){return JSON.parse(JSON.stringify(state))},analyze:M.analyze};window.addEventListener('pagehide',function(){document.removeEventListener('keydown',key)},{once:true});
})();
