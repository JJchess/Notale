import type {Page} from '@playwright/test';
/** The format panel is a PowerPoint-style pane: a control is only in the DOM's flow once its
 * icon tab is chosen. Specs name a control and this brings the tab that owns it to the front,
 * so a spec never has to know the panel's layout. */
const FACETS:[RegExp,'object'|'text'|'page',string][]=[
 [/^(property-appearance|appearance-(fill|stroke|gradient|radius|accent))/,'object','fill'],
 [/^appearance-(shadow|opacity)/,'object','effects'],
 [/^(property-textbox|text-reflow|appearance-fit)/,'text','textbox'],
 [/^(property-text$|object-text|apply-text|font-|color$|bold$|italic$|line-height|letter-spacing|text-align|writing-mode|reset-typography|typography-status)/,'text','font'],
 [/^(property-(geometry|arrange|identity|components|advanced)|tx$|ty$|object-(width|height|name)|rotation$|scale$|geometry-proportional|arrange-|front$|back$|layer-|rotate-group|scale-group|group-(angle|factor)|save-object-name|show-objects|hide-objects|author-|style-json|attrs-json|apply-advanced|rich-text|link-|update-link|remove-link)/,'object','layout'],
 [/^(property-binding|binding-|save-binding|media-|replace-|save-media|crop-|open-image-crop|open-equation-editor|open-code-editor|open-chart-editor|convert-echarts|connector-|save-connector|scene-|read-scene|save-scene|reset-scene|select-scene-root|native-chart-|inspect-native-chart|save-native-chart|reset-native-chart|echarts-|visual-table|table-|apply-table|merge-table-range|save-table-cell|layout-item-|cycle-count|reveal-|save-reveal|vector-properties|component-member|select-component-member)/,'object','special'],
 [/^(page-background|background-)/,'page','background'],
 [/^(deck-theme|theme-|open-theme-settings)/,'page','theme'],
 [/^(deck-(width|height)|save-deck-size|deck-size-status|layout-value|shared-layout|create-visual-layout|visual-layout-name|apply-layout-all|edit-layout-canvas|publish-master|page-master-settings)/,'page','page'],
];
function facetOf(id:string){
 const name=id.replace(/^#/,'');
 return FACETS.find(([pattern])=>pattern.test(name));
}
/** Bring each control's tab to the front, in order. Ids the panel does not own are ignored,
 * so a spec can pass everything it is about to touch. */
export async function reveal(page:Page,...ids:string[]){
 for(const id of ids){
  const facet=facetOf(id);
  if(!facet)continue;
  // The inspector may be open on another tab (objects/animation), so check the format tab
  // itself rather than the panel, and only click the tool when it is not already showing.
  const format=page.locator('[data-panel="format"]');
  if(!(await format.isVisible()))await page.locator('[data-tool="style"]').click();
  await format.waitFor({state:'visible'});
  const scope=page.locator(`[data-format-scope="${facet[1]}"]`);
  if(await scope.isVisible())await scope.click();
  const tab=page.locator(`#format-tab-${facet[2]}`);
  if(await tab.isVisible())await tab.click();
 }
}
