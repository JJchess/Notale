export default function(r=[]){let t=0,f=r.length,l=!1;for(;t<f;){const e=r[t];e.update&&(l=!0,e.ry+=e.speed,e.y<=e.ry&&(e.ry=e.y,e.update=!1)),t++}return l}
