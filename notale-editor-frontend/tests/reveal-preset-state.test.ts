import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRevealPreset,revealPresetState} from '../src/state/reveal-preset';
import {revealInsertCommands} from '../src/reveal-commands';
test('reveal draft survives renders and conflicting updates; stale form cannot save another document',async()=>{
 const insert=revealInsertCommands('page')[0] as any;
 const component=insert.slide.components[0];let documentId='one',commands=0;
 const slide={id:'page',components:[component]} as any;
 const objects=[{id:'reveal-root',attributes:{'data-notale-preset':'reveal'}},{id:'reveal-toggle',parent:'reveal-root',text:'查看解释',attributes:{'data-notale-role':'toggle'}},{id:'reveal-answer',parent:'reveal-root',text:'Original',attributes:{'data-notale-role':'answer'}}].map(object=>({tag:'div',locked:false,text:'',...object})) as any;
 const binding=createRevealPreset({documentId:()=>documentId,slide:()=>slide,objects:()=>objects,selected:()=>['reveal-root'],commands:async()=>{commands++;},whenReady:async()=>{},choose:()=>{},error:()=>{}});
 binding.render();revealPresetState.getSnapshot().change!({answer:'Draft'});binding.render();assert.equal(revealPresetState.getSnapshot().draft?.answer,'Draft');
 objects[2].text='Remote';binding.render();assert.equal(revealPresetState.getSnapshot().draft?.answer,'Draft');await revealPresetState.getSnapshot().save!();assert.equal(commands,0);assert.match(revealPresetState.getSnapshot().error,/已变化/);
 revealPresetState.getSnapshot().reset!();assert.equal(revealPresetState.getSnapshot().draft?.answer,'Remote');
 const stale=revealPresetState.getSnapshot().save!;documentId='two';binding.render();await stale();assert.equal(commands,0);
 const active=revealPresetState.getSnapshot().save!;binding.dispose();await active();assert.equal(commands,0);
});
