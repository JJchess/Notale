import {inspectSelection} from './state/inspector.js';
import {editorSession} from './state/editor-session.js';
type ObjectInfo = { id: string; parent?: string; tag: string; text: string; locked: boolean; attributes: Record<string, string> };
export function createContextInspector() {
  return {
    render(objects: ObjectInfo[], ids: string[]) {
      const selection=inspectSelection(objects,ids);
      if(JSON.stringify(selection)!==JSON.stringify(editorSession.getSnapshot().inspector))editorSession.update({inspector:selection});
      const session=editorSession.getSnapshot(),one=selection.single&&selection.text?objects.find(object=>ids.includes(object.id)):undefined;
      const textField=one&&session.document?{key:JSON.stringify([session.document.document.id,session.activePageId,one.id]),documentId:session.document.document.id,slideId:session.activePageId,target:one.id,value:one.text,editable:!selection.locked}:undefined;
      if(JSON.stringify(textField)!==JSON.stringify(session.textField))editorSession.update({textField});
    },
  };
}
