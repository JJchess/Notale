'use client';
import {useEffect,useState} from 'react';
/** Retain the previous image while the isolated renderer prepares the requested page. */
export function PosterImage({url,title=''}:{url:string;title?:string}){
 const [source,setSource]=useState('');
 useEffect(()=>{const abort=new AbortController();let objectUrl='',timer:ReturnType<typeof setTimeout>;
 const load=async()=>{try{const response=await fetch(url,{signal:abort.signal});if(response.status===202){timer=setTimeout(()=>void load(),1500);return;}if(!response.ok)return;const blob=await response.blob();if(abort.signal.aborted)return;objectUrl=URL.createObjectURL(blob);setSource(objectUrl);}catch(error){if(!abort.signal.aborted)console.debug('Poster unavailable',error);}};
 if(url)void load();return()=>{abort.abort();clearTimeout(timer);if(objectUrl)URL.revokeObjectURL(objectUrl);};},[url]);
 return source?<img src={source} alt={title} draggable={false} style={{display:'block',width:'100%',height:'100%',objectFit:'contain'}}/>:null;
}
