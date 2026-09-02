#!/usr/bin/env python3
"""Reduce trials.csv to score bins, quantiles and N; no responses are shipped."""
import csv,json,sys
from pathlib import Path

def factor(s):
    out=[];i=0
    while i<len(s):
        n=1;seen=s[:i]
        while i+n<=len(s) and s[i:i+n] in seen:n+=1
        n=min(n,len(s)-i);out.append(s[i:i+n]);i+=n
    return out

def analyze(s):
    blocks=[len({s[i:i+k] for i in range(13-k)}) for k in (2,3)]
    switches=sum(a!=b for a,b in zip(s,s[1:]))
    lag=max(sum(s[i]==s[i-p] for i in range(p,12))/(12-p) for p in range(1,5))
    lz=(len(factor(s))-4)/3
    variety=((blocks[0]-1)/3+(blocks[1]-1)/7)/2
    switch_fit=max(0,1-abs(switches/11-.5)/.5)
    structure=(switch_fit+min(1,2*(1-lag)))/2
    return 100*(.4*lz+.35*variety+.25*structure),switches

def quantiles(values,points):
    a=sorted(values);out=[]
    for p in points:
        x=(len(a)-1)*p;i=int(x);out.append(round(a[i]+(a[min(i+1,len(a)-1)]-a[i])*(x-i),6))
    return out

here=Path(__file__).resolve()
source=Path(sys.argv[1]) if len(sys.argv)>1 else here.parents[6].parent/'refs/pudding-data/random/trials.csv'
scores=[];switches=[]
with source.open(newline='',encoding='utf-8') as f:
    for row in csv.DictReader(f):
        s=row['toss'].strip()
        if len(s)==12 and set(s)<=set('01'):
            score,change=analyze(s);scores.append(score);switches.append(change)
bins=[0]*50
for score in scores:bins[min(49,int(score//2))]+=1
levels=sorted({round(analyze(format(i,'012b'))[0],8) for i in range(4096)})
level_index={v:i for i,v in enumerate(levels)}
rank_bins=[0]*len(levels)
for score in scores:rank_bins[level_index[round(score,8)]]+=1
data={'n':len(scores),'binWidth':2,'bins':bins,'quantiles':{
    'score':quantiles(scores,(.1,.25,.5,.75,.9)),
    'switches':quantiles(switches,(.1,.25,.5,.75,.9))},'rankBins':rank_bins}
target=here.parent/'output/pages/assets/human-data.js'
target.write_text('window.HUMAN_BASELINE='+json.dumps(data,separators=(',',':'))+';\n',encoding='utf-8')
print(f'{len(scores)} valid toss sequences -> {target}')
