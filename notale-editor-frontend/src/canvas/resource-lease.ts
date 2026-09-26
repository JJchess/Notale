import {keepPreviewAlive} from '../preview-lease';
import {resourceNotices,type ResourceScope} from '../state/resource-notices';
/** Bridges resource lifecycle events to view state without constructing UI. */
export function trackPreviewLease(documentId:string,preview:Parameters<typeof keepPreviewAlive>[1],scope:ResourceScope='editor'){
 const notify=resourceNotices.register(scope,()=>lease.renew());
 const lease=keepPreviewAlive(documentId,preview,notify);
 return lease;
}
