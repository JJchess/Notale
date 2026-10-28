import {redirect} from 'next/navigation';
/** Compatibility only: editing always happens in the main Notale workspace. */
export default async function FilmPage({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}){
 const params=await searchParams,query=new URLSearchParams();for(const [key,value]of Object.entries(params)){if(key==='film'||value===undefined)continue;for(const item of Array.isArray(value)?value:[value])query.append(key,item);}
 const id=params.document??params.film;if(typeof id==='string')query.set('document',id);redirect('/'+(query.size?'?'+query:''));
}
