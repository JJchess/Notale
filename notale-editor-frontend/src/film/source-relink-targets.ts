/** OpenFilm n is one-based; an absent n keeps the entire matching element set. */
export function overrideTargets<T>(targets:readonly T[],n?:number):T[]{return n===undefined?[...targets]:targets.slice(n-1,n);}
/** Retained author rules may already overlap intentionally. A newly mapped rule
 * must never acquire a retained element or an element assigned by another map. */
export function assertRelinkTargets<T>(retained:Iterable<T>,mapped:readonly {label:string;targets:readonly T[]}[]):void{
 const occupied=new Set(retained);
 for(const mapping of mapped){if(!mapping.targets.length)throw Error(mapping.label+'：新对象已不存在，请重新选择');for(const target of new Set(mapping.targets)){if(occupied.has(target))throw Error(mapping.label+'：目标已保留其他调整或已用于另一项映射，请选择其他对象');occupied.add(target);}}
}
