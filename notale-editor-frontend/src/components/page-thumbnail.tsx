'use client';
import {useLayoutEffect,useRef} from 'react';
import {registerThumbnailHost} from '../canvas/thumbnail-hosts';
export function PageThumbnail({documentId,pageId}:{documentId:string;pageId:string}){
 const host=useRef<HTMLSpanElement>(null);
 useLayoutEffect(()=>registerThumbnailHost({element:host.current!,documentId,pageId}),[documentId,pageId]);
 return <span ref={host} className="page-thumbnail" aria-hidden="true" data-thumbnail={pageId}/>;
}
