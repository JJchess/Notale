import {test} from 'node:test';
import assert from 'node:assert/strict';
import {componentMemberOptions,createComponentNavigation,componentNavigationState,type ComponentNavigationSource} from '../src/state/component-navigation';
const fixture=():ComponentNavigationSource=>({scope:'doc/page/1',target:'child',objects:[{id:'child',parent:'root'},{id:'root'}],components:[{id:'chart',component:{root:'root',controls:{slow:'button'},metrics:{custom:'metric'}} as any}]});
test('component navigation resolves descendants, names unknown metrics and rejects stale actions',()=>{
 const source=fixture(),selected:string[]=[];assert.deepEqual(componentMemberOptions(source).map(option=>option.label),['整个组件','图表','按钮 slow','custom']);
 const navigation=createComponentNavigation({source:()=>source,select:id=>selected.push(id)});navigation.render();componentNavigationState.getSnapshot().choose?.('button');navigation.render();assert.equal(componentNavigationState.getSnapshot().selected,'button');componentNavigationState.getSnapshot().select?.();assert.deepEqual(selected,['button']);
 const stale=componentNavigationState.getSnapshot();source.scope='other/page/1';stale.select?.();assert.deepEqual(selected,['button']);navigation.dispose();assert.equal(componentNavigationState.getSnapshot().select,undefined);
});
test('component ancestry cycles terminate and produce no unrelated member choices',()=>{
 const source=fixture();source.objects=[{id:'child',parent:'loop'},{id:'loop',parent:'child'}];assert.deepEqual(componentMemberOptions(source),[]);
});
