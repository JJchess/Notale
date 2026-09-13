import type {DeckDocument} from './model.js';
import {mergeDocuments} from './sync-merge.js';
/** Reconstruct only acknowledged predecessors, without importing unrelated remote edits. */
export function causalBase(source:DeckDocument,baseVersion:number,revisions:{version:number;before:DeckDocument;after:DeckDocument}[]):DeckDocument {
 let projected=source;
 for(const revision of [...revisions].sort((a,b)=>a.version-b.version))if(revision.version>baseVersion)projected=mergeDocuments(revision.before,revision.after,projected);
 return projected;
}
