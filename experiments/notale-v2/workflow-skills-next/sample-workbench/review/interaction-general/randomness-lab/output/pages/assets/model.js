(function(g){
  'use strict';
  function factor(s){
    for(var out=[],i=0;i<s.length;){
      var n=1,seen=s.slice(0,i);
      while(i+n<=s.length&&seen.includes(s.slice(i,i+n)))n++;
      n=Math.min(n,s.length-i);out.push(s.slice(i,i+n));i+=n;
    }
    return out;
  }
  function analyze(s){
    if(!/^[01]{12}$/.test(s))throw Error('sequence must contain exactly 12 bits');
    var phrases=factor(s),sets=[2,3].map(function(k){
      var x=new Set();for(var i=0;i<=12-k;i++)x.add(s.slice(i,i+k));return x.size;
    }),switches=0,runs=[1];
    for(var j=1;j<12;j++)if(s[j]===s[j-1])runs[runs.length-1]++;else{switches++;runs.push(1)}
    var lag={p:1,match:0};
    for(var p=1;p<=4;p++){
      var same=0;for(var q=p;q<12;q++)same+=s[q]===s[q-p];
      same/=12-p;if(same>lag.match)lag={p:p,match:same};
    }
    var lz=(phrases.length-4)/3;
    var blocks=((sets[0]-1)/3+(sets[1]-1)/7)/2;
    var switchFit=Math.max(0,1-Math.abs(switches/11-.5)/.5);
    var repeatFree=Math.min(1,2*(1-lag.match));
    var structure=(switchFit+repeatFree)/2;
    return {sequence:s,score:100*(.4*lz+.35*blocks+.25*structure),phrases:phrases,lz:phrases.length,
      blocks:sets,switches:switches,runs:runs,longest:Math.max.apply(null,runs),lag:lag,
      parts:[lz,blocks,structure]};
  }
  function quantile(a,p){var x=(a.length-1)*p,i=Math.floor(x);return a[i]+(a[Math.min(i+1,a.length-1)]-a[i])*(x-i)}
  var cache;
  function theory(){
    if(cache)return cache;
    var scores=[],bins=Array(50).fill(0);
    for(var i=0;i<4096;i++){var v=analyze(i.toString(2).padStart(12,'0')).score;scores.push(v);bins[Math.min(49,Math.floor(v/2))]++}
    scores.sort(function(a,b){return a-b});
    var levels=scores.filter(function(v,i){return !i||Math.abs(v-scores[i-1])>1e-8});
    cache={n:4096,scores:scores,levels:levels,bins:bins,binWidth:2,quantiles:[.1,.25,.5,.75,.9].map(function(p){return quantile(scores,p)})};
    return cache;
  }
  var api={analyze:analyze,theory:theory,factor:factor};
  g.RandomnessModel=api;if(typeof module!=='undefined')module.exports=api;
})(typeof window==='undefined'?globalThis:window);
