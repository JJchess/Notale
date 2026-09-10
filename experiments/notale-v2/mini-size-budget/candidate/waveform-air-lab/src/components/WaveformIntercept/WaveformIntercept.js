import a from"react";import c from"styled-components";import{WAVEFORM_ASPECT_RATIO as E,DEFAULT_WAVEFORM_SIZE as f,DEFAULT_WAVEFORM_NUM_OF_CYCLES as l,DEFAULT_WAVEFORM_AMPLITUDE as A}from"../../constants";import{getInterceptPosition as _}from"../../helpers/waveform.helpers";const d=({color:t="red",size:o=16,waveformSize:e=f,waveformShape:r,frequency:i=l,amplitude:s=A,offset:n})=>{const p=e*E,m=_(r,p,i,s,n);return a.createElement(F,{position:m,color:t,size:o})},F=c.div.attrs({style:({position:t})=>({transform:`translateY(${t}px)`})})`
  width: ${t=>t.size+"px"};
  height: ${t=>t.size+"px"};
  border-radius: 50%;
  background: ${t=>t.color};
  position: absolute;
  top: ${t=>-1*t.size/2+"px"};
  left: ${t=>-1*t.size/2+"px"};
  will-change: transform;
`;export default d;
