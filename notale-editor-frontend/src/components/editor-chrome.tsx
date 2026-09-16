import {CourseDialog} from './course-editor';
import {unavailableFeature} from '../feature-availability';
import {ObjectMenu} from './object-menu';
import {TeachingSteps} from './teaching-steps';
import {ComponentLibraryShortcut} from './component-library-shortcut';
import {MediaPicker} from './media-picker';
import {ImportControls,ExportControls,DocumentIOStatus} from './document-io';
import {ZoomIn,ZoomOut,ZoomSelect,PanMode} from './viewport-controls';
import {EmptyCanvas,SelectionTools,ObjectLockButton,DockPageNavigation,PageCount} from './dock-controls';
import {Notifications} from './notifications';
import {SmartDiagram} from './smart-diagram';
import {ComponentInspector} from './component-inspector';
import {VectorInspector} from './vector-inspector';
import {TemplateLibrary,TemplatePreview} from './template-library';
import {InsertionDrop} from './insertion-drop';
import {InsertCatalog} from './insert-catalog';
import {InteractiveDrawer} from './interactive-drawer';
import {SourceEditor} from './source-editor';
import {MediaInspector} from './media-inspector';
import {SaveRecoveryActions} from './save-recovery-actions';
import {Arrangement} from './arrangement';
import {ConnectorInspector} from './connector-inspector';
import {NativeChartInspector} from './native-chart-inspector';
import {ComponentNavigation} from './component-navigation';
import {SceneInspector} from './scene-inspector';
import {LayoutManager,MasterEditBanner} from './layout-manager';
import {NotesEditor} from './notes-editor';
import {AnimationHeading,AnimationPreviewControls,AnimationEditingStatus} from './animation-controls';
import {AnimationForm} from './animation-form';
import {AnimationGallery} from './animation-gallery';
import {AnimationList,AnimationTimeline} from './animation-list';
import {TextLinkDialog} from './text-link-dialog';
import {ChartDataDock} from './chart-dock';
import {ChartBindingsView} from './chart-bindings';
import {ChartToolbarView} from './chart-toolbar';
import {ChartGridView} from './chart-grid';
import {ChartDataMenuView} from './chart-data-menu';
import {ChartImportDialog} from './chart-import';
import {ChartGalleryDialog} from './chart-gallery';
import {StaticChartDialog} from './static-chart-editor';
import {CodeDialog} from './code-editor';
import {EquationDialog} from './equation-editor';
import {TypographyEditor} from './typography-editor';
import {AppearanceEditor} from './appearance-editor';
import {FindReplaceDialog} from './find-replace';
import {CommentsPanel,CommentsButton} from './comments-panel';
import {ImageCropDialog} from './image-crop';
import {ThemePanel} from './theme-panel';
import {PageBackground} from './page-background';
import {MediaDropOverlay} from './media-drop';
import {RichEditorDialog,RichEditorButton} from './rich-editor';
import {LinkInsertDialog} from './link-editor';
import {PageSettingsDialog} from './page-settings';
import {HeaderMenu} from './header-menu';
import {CanvasLoading} from './canvas-loading';
import {ViewSettingsMenu} from './view-settings';
import {DocumentDialogs,PageSizeSettings} from './document-settings';
import {Layers} from './layers';
import {ResourceNotice} from './resource-notice';
import {PreviewOverlay} from './preview-overlay';
import {StepControls} from './step-controls';
import {StyleScope,StyleScopeScroll} from './style-scope';
import {PropertyGroup} from './property-group';
import {GeometryFields,TextReflowControl} from './geometry-fields';
import {ObjectIdentityEditor} from './object-identity-editor';
import {BindingEditor} from './binding-editor';
import {ObjectTextEditor} from './object-text-editor';
import {SelectionSummary} from './selection-summary';
import {FormatTabs,FormatPane} from './format-tabs';
import {RevealEditor} from './reveal-preset';
import {NativeChartProperties} from './chart-properties';
import {StaticChartButtons} from './static-chart-editor';
import {CodeButton} from './code-editor';
import {EquationButton} from './equation-editor';
import {TableEditor} from './table-editor';
import {ImageCropButton} from './image-crop';
import {LinkInspectorPanel} from './link-editor';
import {SidebarEffects,SidebarPanel,InspectorPanel,InspectorTabButton,ToolButton,SidebarControl} from './sidebar';
import {FileMenu} from './file-menu';
import {DocumentSwitcher} from './document-switcher';
import {SaveStatus,HistoryControls,PresentControls} from './editor-controls';
import {CanvasHost} from './canvas-host';
import {PageList} from './page-list';
// React owns the editor shell. Empty panel hosts are populated by the editing controllers.
function ActivityBar(){return (<nav className="tool-rail" aria-label="创作工具">
<a className="tool-brand" href="/" aria-label="Notale 首页">{"N"}<span>
</span>
</a>
<ToolButton tool="insert" aria-controls="tool-panel" title="插入" aria-label="插入">
<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
<path d="M12 4v16M4 12h16">
</path>
</svg>

</ToolButton>
<ToolButton tool="style"  title="样式" aria-label="样式">
<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
<path d="m15 3 6 6-10 10-6-6Z M5 13l-3 9 9-3">
</path>
</svg>

</ToolButton>
<ToolButton tool="interactive" aria-controls="tool-panel" title="互动" aria-label="互动">
<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
<path d="M5 4h14v11H9l-4 4Z">
</path>
<path d="M9.5 8.5h5M9.5 11.5h3">
</path>
</svg>

</ToolButton>
<ToolButton tool="templates" aria-controls="tool-panel" title="模板" aria-label="模板">
<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinejoin="round" aria-hidden="true">
<rect x="3" y="4" width="18" height="16" rx="2">
</rect>
<path d="M3 9h18M10 9v11">
</path>
</svg>

</ToolButton>
<ToolButton tool="pages"  title="页面" aria-label="页面">
<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
<rect x="6" y="3" width="15" height="14" rx="2">
</rect>
<path d="M3 7v14h15">
</path>
</svg>

</ToolButton>
<ToolButton tool="objects"  title="图层" aria-label="图层">
<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
<path d="m12 3 9 5-9 5-9-5Zm-9 10 9 5 9-5M3 18l9 5 9-5">
</path>
</svg>

</ToolButton>

<ToolButton tool="animation"  title="动画" aria-label="动画">
<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
<path d="m9 5 11 7-11 7Z M3 5v14">
</path>
</svg>

</ToolButton>
</nav>);}

function EditorHeader(){return (<header className="app-header">
<a className="brand" href="/">{"Notale"}<span>{"互动演示"}</span>
</a>
<div className="header-history" role="toolbar" aria-label="历史操作"><HistoryControls/></div>
<FileMenu/><DocumentSwitcher/>
<div className="header-selection" role="toolbar" aria-label="对象操作"><SelectionTools/></div>
<span className="preview-indicator">{"互动预览"}</span>
<SaveStatus/><SaveRecoveryActions/>
<HeaderMenu id="import" label="导入" title="导入 PPTX 或 Notale 文件">
<ImportControls/>
</HeaderMenu>
<HeaderMenu id="export" label="导出" title="导出 PDF 或 Notale 文件">
<ExportControls/>
</HeaderMenu>
<DocumentIOStatus/><PresentControls/>
</header>);}

function EditorWorkspace(){return (<main className="workspace"><SidebarEffects/>
<SidebarPanel as="aside" id="tool-panel" className="tool-panel" aria-label="内容工具">
<div className="tool-panel-heading" hidden={true}>
<strong id="tool-panel-title">
</strong>
<SidebarControl action="close-tools" id="close-tool-panel" aria-label="收起工具面板">{"×"}</SidebarControl>
</div>
<SidebarPanel as="div" id="insert-drawer">
<InsertCatalog/>
</SidebarPanel>
<SidebarPanel as="div" id="interactive-drawer">
<InteractiveDrawer/>
</SidebarPanel>
<TemplatePreview/>
<SidebarPanel as="div" id="template-drawer">
<TemplateLibrary/>
</SidebarPanel>
<section data-library="components" {...unavailableFeature}>

<ComponentLibraryShortcut/>
</section>

</SidebarPanel>
<SidebarPanel as="aside" id="page-panel" className="slide-rail" aria-label="页面导航">
<div className="rail-title" hidden={true}>{"页面 "}<PageCount/>
</div>
<PageList/>
</SidebarPanel>
<section className="center">

<MasterEditBanner/>
<div id="canvas-viewport" className="canvas-viewport" tabIndex={0} aria-label="画布视口">
<CanvasLoading/><InsertionDrop/>
<div id="canvas-stage" className="canvas-stage">
<div className="canvas-wrap">
<CanvasHost/>
<EmptyCanvas/>
<div id="canvas-pan-surface" hidden={true} aria-hidden="true">
</div>
</div>
</div>
</div>
<ChartDataDock/>
<div className="viewbar" aria-label="画布视图">
<div className="view-tools">
<ZoomOut/>
<ZoomSelect/>
<ViewSettingsMenu/>
<ZoomIn/>
<details className="view-menu" hidden={true}>
<div>
<PanMode/>
<SidebarControl action="focus" id="focus-canvas" title="暂时收起侧栏和讲稿，再次点击恢复">{"收起侧栏"}</SidebarControl>
<SidebarControl action="pages" id="toggle-pages" aria-controls="page-panel" hidden={true}>{"页面"}</SidebarControl>
<SidebarControl action="inspector" id="toggle-inspector" aria-controls="property-panel" hidden={true}>{"属性"}</SidebarControl>
</div>
</details>
</div>
<div className="view-tools">
<DockPageNavigation/>
</div>
<div className="view-tools">
<CommentsButton/>
<SidebarControl action="notes" id="toggle-notes" aria-controls="notes-panel" title="讲稿" aria-label="讲稿"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 3h16v18H4ZM8 7h8M8 11h8M8 15h5"/></svg></SidebarControl>
</div>
</div>

<SidebarPanel as="div" id="notes-panel" className="bottom-panel">
<NotesEditor/>
<AnimationTimeline/>
</SidebarPanel>
<CommentsPanel/></section>
<SidebarPanel as="aside" id="property-panel" className="inspector" aria-label="编辑属性">
<div className="inspector-heading" hidden={true}>
<span>{"编辑工具"}</span>
<SidebarControl action="close-inspector" id="close-inspector" aria-label="关闭编辑工具">{"×"}</SidebarControl>
</div>
<div className="tabs" hidden={true}>
<InspectorTabButton tab="objects" >{"对象"}</InspectorTabButton>
<InspectorTabButton tab="format" >{"格式"}</InspectorTabButton>
<InspectorTabButton tab="animation" >{"动画"}</InspectorTabButton>
</div>
<InspectorPanel tab="objects" >
<Layers/>
</InspectorPanel>
<InspectorPanel tab="format" >
<StyleScopeScroll/><StyleScope scope="object">
<SelectionSummary/><FormatTabs of="object"/>
<PropertyGroup id="property-text" title="文字" kind="text" facet="font">
<RichEditorButton inTextGroup/><ObjectTextEditor/>
<TypographyEditor/>
</PropertyGroup>
<PropertyGroup id="property-textbox" title="文本框" kind="text" facet="textbox"><TextReflowControl/></PropertyGroup>
<FormatPane facet="special">
<VectorInspector/>
<ImageCropButton/><EquationButton/><CodeButton/><StaticChartButtons/>
<MediaInspector/>
<ConnectorInspector/>
<RevealEditor/>
<SceneInspector/>
<NativeChartProperties/>
<NativeChartInspector/>
<ComponentNavigation/>
<TableEditor/>
<SmartDiagram/>
</FormatPane>
<PropertyGroup id="property-binding" title="互动初始值" kind="binding" facet="special"><BindingEditor/></PropertyGroup>
<PropertyGroup id="property-geometry" title="位置与尺寸" facet="layout"><GeometryFields/></PropertyGroup><AppearanceEditor/>
<PropertyGroup id="property-arrange" title="排列与对齐" collapsible facet="layout">
<Arrangement/>
</PropertyGroup>
<PropertyGroup id="property-identity" title="名称与可见性" collapsible facet="layout"><ObjectIdentityEditor/><ObjectLockButton/></PropertyGroup>
<FormatPane facet="layout"><LinkInspectorPanel/></FormatPane>
<PropertyGroup id="property-components" title="组件与状态" kind="always" collapsible facet="layout"><ComponentInspector/></PropertyGroup>
<PropertyGroup id="property-advanced" unavailable title="高级：源样式与数据" collapsible facet="layout">
<SourceEditor/>
</PropertyGroup>
</StyleScope>
<StyleScope scope="global">
<span className="settings-scope">{"全局样式"}</span><FormatTabs of="page"/>
<FormatPane facet="page"><PageSizeSettings/></FormatPane>
<FormatPane facet="theme"><ThemePanel/></FormatPane><FormatPane facet="background"><PageBackground/></FormatPane><FormatPane facet="page"><LayoutManager/></FormatPane>


</StyleScope>
</InspectorPanel>
<InspectorPanel tab="animation" >
<AnimationHeading/><AnimationGallery/><AnimationPreviewControls/>
<div className="animation-list-heading">
<strong>{"动画顺序"}</strong>

</div>
<AnimationList/>
<AnimationEditingStatus/>
<AnimationForm/>
<details className="animation-step-details"><summary>讲授步骤与讲稿</summary><StepControls/><div id="teaching-steps-mount"><TeachingSteps/></div></details>
</InspectorPanel>
</SidebarPanel>
<PreviewOverlay/></main>);}

function EditorAuxiliary1(){return <MediaPicker/>;}

function EditorAuxiliary2(){return <Notifications/>;}
export function EditorChrome(){return <>
<ActivityBar />
<EditorHeader />
<EditorWorkspace />
<EditorAuxiliary1 /><ObjectMenu/>
<ResourceNotice scope="editor"/>
<MediaDropOverlay/><EditorAuxiliary2 /><LinkInsertDialog/><TextLinkDialog/><RichEditorDialog/><ImageCropDialog/><FindReplaceDialog/><EquationDialog/><CodeDialog/><CourseDialog/><StaticChartDialog/><ChartGalleryDialog/><ChartImportDialog/><ChartDataMenuView/><ChartGridView/><ChartToolbarView/><ChartBindingsView/><DocumentDialogs/><PageSettingsDialog/>
</>;}
