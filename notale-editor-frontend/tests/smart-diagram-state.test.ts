import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createSmartDiagram,smartDiagramState} from '../src/state/smart-diagram';
test('smart diagram guards stale selection and rejects invalid counts while preserving labels',async()=>{
 const objects=[{id:'root',tag:'div',text:'',locked:false,attributes:{'data-notale-smart':'cycle'}},...['准备','训练','评估'].map((text,i)=>({id:'p'+i,parent:'root',tag:'p',text,locked:false,attributes:{}}))];let pageId='one';const sent:any[]=[];
 const binding=createSmartDiagram({source:()=>({documentId:'doc',pageId,objects,selection:['root']}),commands:async commands=>{sent.push(commands);}});binding.render();smartDiagramState.getSnapshot().change!('7');await smartDiagramState.getSnapshot().save!();assert.equal(sent.length,0);assert.match(smartDiagramState.getSnapshot().error,/3 到 6/);
 smartDiagramState.getSnapshot().change!('5');binding.render();assert.equal(smartDiagramState.getSnapshot().count,'5');await smartDiagramState.getSnapshot().save!();assert.equal(sent.length,1);assert.match(sent[0][0].html,/准备/);assert.equal(sent[0][1].patch.attributes['data-notale-cycle'],'5');
 const stale=smartDiagramState.getSnapshot().save!;pageId='two';binding.render();await stale();assert.equal(sent.length,1);objects[0].locked=true;binding.render();smartDiagramState.getSnapshot().change!('4');await smartDiagramState.getSnapshot().save!();assert.equal(sent.length,1);binding.dispose();
});
