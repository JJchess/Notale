import {unavailableFeature} from '../feature-availability';
import {ObjectMenu} from './object-menu';
import {TeachingSteps} from './teaching-steps';
import {ComponentLibraryShortcut} from './component-library-shortcut';
import {MediaPicker} from './media-picker';
import {ImportControls,ExportControls,DocumentIOStatus} from './document-io';
import {ZoomIn,ZoomOut,ZoomSelect,PanMode} from './viewport-controls';
import {EmptyCanvas,SelectionTools,ObjectLockButton,OverviewButton,DockPageActions,DockPageNavigation,PageName,PageCount} from './dock-controls';
import {Notifications} from './notifications';
import {SmartDiagram} from './smart-diagram';
import {ComponentInspector} from './component-inspector';
import {VectorInspector} from './vector-inspector';
import {TemplateLibrary,TemplatePreview} from './template-library';
import {InsertionDrop} from './insertion-drop';
import {InsertCatalog} from './insert-catalog';
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
import {FindReplaceDialog,FindReplaceButton} from './find-replace';
import {CommentsPanel,CommentsButton} from './comments-panel';
import {ImageCropDialog} from './image-crop';
import {ThemePanel} from './theme-panel';
import {PageBackground} from './page-background';
import {MediaDropOverlay} from './media-drop';
import {RichEditorDialog,RichEditorButton} from './rich-editor';
import {LinkInsertDialog} from './link-editor';
import {PageSettingsDialog,PageSettingsButton} from './page-settings';
import {HeaderMenu} from './header-menu';
import {CanvasLoading} from './canvas-loading';
import {ViewSettingsMenu} from './view-settings';
import {DocumentDialogs,PageSizeSettings} from './document-settings';
import {Layers} from './layers';
import {ResourceNotice} from './resource-notice';
import {PreviewOverlay,PreviewToggle} from './preview-overlay';
import {StepControls} from './step-controls';
import {StyleScope,StyleScopeScroll} from './style-scope';
import {PropertyGroup} from './property-group';
import {GeometryFields,TextReflowControl} from './geometry-fields';
import {ObjectIdentityEditor} from './object-identity-editor';
import {BindingEditor} from './binding-editor';
import {ObjectTextEditor} from './object-text-editor';
import {SelectionSummary} from './selection-summary';
import {SidebarEffects,SidebarPanel,InspectorPanel,InspectorTabButton,ToolButton,SidebarControl} from './sidebar';
import {FileMenu} from './file-menu';
import {DocumentSwitcher} from './document-switcher';
import {SaveStatus,HistoryControls,PageCommands,PresentControls} from './editor-controls';
import {CanvasHost} from './canvas-host';
import {PageList,PageSearch} from './page-list';
// React owns the editor shell. Empty panel hosts are populated by the editing controllers.
function ActivityBar(){return (<nav className="tool-rail" aria-label="创作工具">
<a className="tool-brand" href="/" aria-label="Notale 首页">{"N"}<span>
</span>
</a>
<ToolButton tool="insert" aria-controls="tool-panel" title="插入文字、媒体、元素与互动">
<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
<path d="M12 4v16M4 12h16">
</path>
</svg>
<span>{"插入"}</span>
</ToolButton>
<ToolButton tool="style" >
<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
<path d="m15 3 6 6-10 10-6-6Z M5 13l-3 9 9-3">
</path>
</svg>
<span>{"样式"}</span>
</ToolButton>
<ToolButton tool="templates" aria-controls="tool-panel" title="模板">
<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinejoin="round" aria-hidden="true">
<rect x="3" y="4" width="18" height="16" rx="2">
</rect>
<path d="M3 9h18M10 9v11">
</path>
</svg>
<span>{"模板"}</span>
</ToolButton>
<ToolButton tool="pages" >
<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
<rect x="6" y="3" width="15" height="14" rx="2">
</rect>
<path d="M3 7v14h15">
</path>
</svg>
<span>{"页面"}</span>
</ToolButton>
<ToolButton tool="objects" >
<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
<path d="m12 3 9 5-9 5-9-5Zm-9 10 9 5 9-5M3 18l9 5 9-5">
</path>
</svg>
<span>{"图层"}</span>
</ToolButton>

<ToolButton tool="animation" >
<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
<path d="m9 5 11 7-11 7Z M3 5v14">
</path>
</svg>
<span>{"动画"}</span>
</ToolButton>
</nav>);}

function EditorHeader(){return (<header className="app-header">
<a className="brand" href="/">{"Notale"}<span>{"互动演示"}</span>
</a>
<FileMenu/><DocumentSwitcher/>
<span className="preview-indicator">{"互动预览"}</span>
<SaveStatus/><SaveRecoveryActions/>
<HeaderMenu id="import" label="导入" title="导入 PPTX 或工程包">
<ImportControls/>
</HeaderMenu>
<HeaderMenu id="export" label="导出" title="导出 PDF 或工程包">
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
<PageSearch/>
<FindReplaceButton/>
<PageList/>
<div className="rail-actions">
<PageSettingsButton/>
<PageCommands/>
</div>
</SidebarPanel>
<section className="center">
<nav className="toolbar" aria-label="编辑工具">
<HistoryControls/>
<SelectionTools/>
<span className="grow">
</span>
<OverviewButton/>
</nav>
<div className="canvas-label">
<PageName/>

</div>
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
<DockPageActions/>
</div>
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
<PreviewToggle/>
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
<StyleScopeScroll/><StyleScope scope="object"><VectorInspector/>
<SelectionSummary/>
<PropertyGroup id="property-text" title="文字" kind="text">
<RichEditorButton inTextGroup/><ObjectTextEditor/>
<TypographyEditor/>
<TextReflowControl/>
</PropertyGroup>
<MediaInspector/>
<ConnectorInspector/>
<SceneInspector/>
<NativeChartInspector/>
<ComponentNavigation/>
<PropertyGroup id="property-binding" title="互动初始值" kind="binding"><BindingEditor/></PropertyGroup>
<PropertyGroup id="property-geometry" title="位置与尺寸"><GeometryFields/></PropertyGroup><AppearanceEditor/>
<PropertyGroup id="property-arrange" title="排列与对齐" collapsible>
<Arrangement/>
</PropertyGroup>
<PropertyGroup id="property-identity" title="名称与可见性" collapsible><ObjectIdentityEditor/><ObjectLockButton/></PropertyGroup>
<PropertyGroup id="property-components" title="组件与状态" kind="always" collapsible><ComponentInspector/></PropertyGroup>
<PropertyGroup id="property-advanced" unavailable title="高级：源样式与数据" collapsible>
<SourceEditor/>
</PropertyGroup>
<SmartDiagram/>
</StyleScope>
<StyleScope scope="global">
<span className="settings-scope">{"全局样式"}</span>
<PageSizeSettings/>
<ThemePanel/><PageBackground/><LayoutManager/>


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
<MediaDropOverlay/><EditorAuxiliary2 /><LinkInsertDialog/><TextLinkDialog/><RichEditorDialog/><ImageCropDialog/><FindReplaceDialog/><EquationDialog/><CodeDialog/><StaticChartDialog/><ChartGalleryDialog/><ChartImportDialog/><ChartDataMenuView/><ChartGridView/><ChartToolbarView/><ChartBindingsView/><DocumentDialogs/><PageSettingsDialog/>
</>;}
