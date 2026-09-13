'use client';
import {useSyncExternalStore} from 'react';
import {mediaDropState} from '../state/media-drop';
export function MediaDropOverlay(){const bounds=useSyncExternalStore(mediaDropState.subscribe,mediaDropState.getSnapshot,mediaDropState.getServerSnapshot);return <div id="media-drop-overlay" hidden={!bounds} style={bounds}>松开以插入图片、视频或音频</div>;}
