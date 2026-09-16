'use client';
import {useSyncExternalStore} from 'react';
import {insertionDropState} from '../state/insertion-drop';
export function InsertionDrop(){const model=useSyncExternalStore(insertionDropState.subscribe,insertionDropState.getSnapshot,insertionDropState.getServerSnapshot);return <div id="insert-drop-overlay" hidden={!model.visible} style={model.bounds} onDragOver={event=>{event.preventDefault();event.dataTransfer.dropEffect='copy';}} onDragLeave={()=>model.leave?.()} onDrop={event=>{event.preventDefault();void model.drop?.(event.dataTransfer.getData('application/x-notale-insert'),event.clientX,event.clientY);}}>松开以放置对象</div>;}
