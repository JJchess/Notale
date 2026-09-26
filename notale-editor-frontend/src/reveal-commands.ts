import {commitSchema,interactionInsertCommands} from '@notale/editor/browser';
export function revealInsertCommands(destination:string,sourcePath='page.html'){
    const componentId=crypto.randomUUID();
    const html=`<section data-notale-id="reveal-root" data-notale-preset="reveal" style="position:absolute;z-index:1000;isolation:isolate;left:120px;top:160px;width:640px;height:340px;box-sizing:border-box;padding:28px;border:1px solid #d9d1ed;border-radius:14px;background:#fff;color:#292a32;font-family:system-ui"><button data-notale-id="reveal-toggle" data-notale-role="toggle" type="button" style="font:600 26px system-ui;padding:14px 22px;border:0;border-radius:8px;background:#6638dc;color:white;cursor:pointer">查看解释</button><p data-notale-id="reveal-answer" data-notale-role="answer" style="font-size:28px;line-height:1.6;margin:24px 0 0">在这里写下解释，讲授时点击按钮揭示。</p></section>`;
    const component={id:componentId,root:'reveal-root',name:'点击展开解释',initial:'closed',duration:200,easing:'ease',states:[
      {id:'closed',name:'收起',patches:{'reveal-toggle':{text:'查看解释'},'reveal-answer':{visible:false,style:{opacity:'0'}}}},
      {id:'open',name:'展开',patches:{'reveal-toggle':{text:'收起解释'},'reveal-answer':{visible:true,style:{opacity:'1'}}}},
    ],events:[{id:'open-event',target:'reveal-toggle',event:'click',from:'closed',to:'open'},{id:'close-event',target:'reveal-toggle',event:'click',from:'open',to:'closed'}],steps:[]};
    return commitSchema.parse({baseVersion:1,mutationId:crypto.randomUUID(),commands:interactionInsertCommands({slide:{id:destination,sourcePath},scratchId:crypto.randomUUID(),html,components:[component as never]})}).commands;
}
