export const getDimensions=(t,n,s,g)=>{const o=t/g,i=n/s,d=i,c=o*2,h=n+d*2,e=t+c*2;return{colWidth:o,rowHeight:i,widthWithPadding:e,heightWithPadding:h,topBottomPadding:d,sidePadding:c}};
