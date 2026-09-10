import {writeFile} from 'node:fs/promises';
import {join} from 'node:path';

// Current diagrams are editable text and vector geometry. They need no page fonts
// or photographs. Refuse unexpected asset references instead of silently dropping them.
export async function writeDiagramPayload(base, data) {
  if(!data.diagram)return;
  const {html,width,height}=data.diagram;
  if(/(?:assets\/|<img\b|@font-face)/i.test(html))throw new Error(`${data.id}: diagram assets must be declared explicitly`);
  const payload={id:data.id,name:data.name,html,width,height,fontCss:'',assets:[]};
  await writeFile(join(base,data.id+'-diagram.json'),JSON.stringify(payload));
}
