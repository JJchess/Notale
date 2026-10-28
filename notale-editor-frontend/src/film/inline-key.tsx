'use client';
import {useSyncExternalStore} from 'react';
import {filmAuthoringActions,filmAuthoringState} from './authoring-state';
import {editorActions} from '../state/editor-session';
import {useI18n} from '../i18n/react';
export function FilmInlineKey({property}:{property:string}){
 const model=useSyncExternalStore(filmAuthoringState.subscribe,filmAuthoringState.getSnapshot,filmAuthoringState.getServerSnapshot),t=useI18n();
 const value=model.properties.find(value=>value.name===property);if(!value)return null;
 const label=t(value.keyed?'移除当前关键帧':'添加当前关键帧')+' · '+t(value.label);
 return <button type="button" className="film-inline-key film-property-key" title={label} aria-label={label} aria-pressed={value.keyed} data-animated={value.animated} disabled={model.disabled} onClick={event=>{event.preventDefault();event.stopPropagation();try{filmAuthoringActions.selectProperty(property);void filmAuthoringActions.toggleKey().catch(editorActions.reportError);}catch(error){editorActions.reportError(error);}}}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 4 8 8-8 8-8-8Z"/></svg></button>;
}
