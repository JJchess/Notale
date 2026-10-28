'use client';
import {useSyncExternalStore} from 'react';
import {insertActionsState} from '../state/insert-actions';
import {useEditorSelector} from '../state/use-editor-selector';
/** Availability belongs to the current editing context, not the document's UI. */
export function useEditingCapability(kind:string){
 const actions=useSyncExternalStore(insertActionsState.subscribe,insertActionsState.getSnapshot,insertActionsState.getServerSnapshot);
 // A bound controller may navigate into another editing context without being
 // replaced. Session publication rechecks availability; equal reasons stay stable.
 return useEditorSelector(()=>actions?.unavailableReason?.(kind));
}
