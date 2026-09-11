// React owns the editor shell. Empty panel hosts are populated by the editing controllers.
function ActivityBar(){return (<nav className="tool-rail" aria-label="创作工具">
<a className="tool-brand" href="/" aria-label="Notale 首页">{"N"}<span>
</span>
</a>
<button data-tool="insert" aria-pressed="false" aria-controls="tool-panel" title="插入文字、媒体、元素与互动">
<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
<path d="M12 4v16M4 12h16">
</path>
</svg>
<span>{"插入"}</span>
</button>
<button data-tool="style" aria-pressed="false">
<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
<path d="m15 3 6 6-10 10-6-6Z M5 13l-3 9 9-3">
</path>
</svg>
<span>{"样式"}</span>
</button>
<button data-tool="templates" aria-pressed="false" aria-controls="tool-panel" title="模板">
<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinejoin="round" aria-hidden="true">
<rect x="3" y="4" width="18" height="16" rx="2">
</rect>
<path d="M3 9h18M10 9v11">
</path>
</svg>
<span>{"模板"}</span>
</button>
<button data-tool="pages" aria-pressed="false">
<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
<rect x="6" y="3" width="15" height="14" rx="2">
</rect>
<path d="M3 7v14h15">
</path>
</svg>
<span>{"页面"}</span>
</button>
<button data-tool="objects" aria-pressed="false">
<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
<path d="m12 3 9 5-9 5-9-5Zm-9 10 9 5 9-5M3 18l9 5 9-5">
</path>
</svg>
<span>{"图层"}</span>
</button>

<button data-tool="animation" aria-pressed="false">
<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
<path d="m9 5 11 7-11 7Z M3 5v14">
</path>
</svg>
<span>{"动画"}</span>
</button>
</nav>);}

function EditorHeader(){return (<header className="app-header">
<a className="brand" href="/">{"Notale"}<span>{"互动演示"}</span>
</a>
<select id="documents" aria-label="选择讲义">
</select>
<span className="preview-indicator">{"互动预览"}</span>
<span id="save-status" role="status" data-state="busy">{"连接中"}</span>
<details className="header-menu" data-header-menu="import">
<summary title="导入 PPTX 或工程包">{"导入"}<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
<path d="m6 9 6 6 6-6">
</path>
</svg>
</summary>
<div className="editor-popup">
<label className="button">{"导入 PPTX"}<input id="import-pptx" type="file" accept=".pptx" hidden={true} />
</label>
<label className="button">{"导入工程"}<input id="import" type="file" accept=".zip" hidden={true} />
</label>
</div>
</details>
<details className="header-menu" data-header-menu="export">
<summary title="导出 PDF 或工程包">{"导出"}<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
<path d="m6 9 6 6 6-6">
</path>
</svg>
</summary>
<div className="editor-popup">
<button id="export-pdf" title="把每一页按讲义尺寸打印为 PDF">{"导出 PDF"}</button>
<button id="export">{"导出工程"}</button>
</div>
</details>
<button id="present" className="primary">{"放映 ↗"}</button>
</header>);}

function EditorWorkspace(){return (<main className="workspace">
<aside id="tool-panel" className="tool-panel" hidden={true} aria-label="内容工具">
<div className="tool-panel-heading" hidden={true}>
<strong id="tool-panel-title">
</strong>
<button id="close-tool-panel" aria-label="收起工具面板">{"×"}</button>
</div>
<div id="insert-drawer">
</div>
<div id="template-drawer" hidden={true}>
</div>
<section data-library="components" hidden={true}>
<p className="hint">{"把一组对象做成可复用组件，在多个页面保持一致。"}</p>
<button data-inspect="author-components">{"打开组件与共享库"}</button>
</section>
<p id="tool-message" className="hint" role="status">
</p>
</aside>
<aside id="page-panel" className="slide-rail" aria-label="页面导航">
<div className="rail-title" hidden={true}>{"页面 "}<span id="slide-count">
</span>
</div>
<label className="slide-search">{"查找页面"}<input id="slide-search" type="search" placeholder="标题或章节" autoComplete="off" />
</label>
<button id="open-find-replace" title="查找和替换讲义中的文字 · Ctrl H">{"查找和替换…"}</button>
<p id="slide-search-empty" className="hint" hidden={true}>{"没有匹配的页面"}</p>
<div id="slides">
</div>
<div className="rail-actions">
<button id="open-page-settings" aria-label="当前页面设置" title="页面设置 · 右键页面或 F2">{"⋯"}</button>
<button id="add-slide">{"＋ 新页"}</button>
<button id="copy-slide">{"复制页"}</button>
<button id="delete-slide">{"删除页"}</button>
<button id="up-slide">{"上移"}</button>
<button id="down-slide">{"下移"}</button>
</div>
</aside>
<section className="center">
<nav className="toolbar" aria-label="编辑工具">
<button id="undo" title="Ctrl Z">{"↶ 撤销"}</button>
<button id="redo" title="Ctrl Shift Z">{"↷ 重做"}</button>
<i id="selection-tools-separator" hidden={true}>
</i>
<button id="group" hidden={true}>{"编组"}</button>
<button id="ungroup" hidden={true}>{"取消编组"}</button>
<button id="align-left" hidden={true}>{"左对齐"}</button>
<button id="distribute" hidden={true}>{"水平分布"}</button>
<span className="grow">
</span>
<button id="overview">{"总览"}</button>
</nav>
<div className="canvas-label">
<span id="page-name">
</span>
<span id="canvas-hint">{"双击文字编辑 · Shift 多选"}</span>
</div>
<div id="canvas-viewport" className="canvas-viewport" tabIndex={0} aria-label="画布视口">
<div id="canvas-stage" className="canvas-stage">
<div className="canvas-wrap">
<iframe id="canvas" title="讲义编辑画布" sandbox="allow-scripts allow-same-origin allow-forms allow-popups">
</iframe>
<div id="empty">{"正在加载讲义…"}</div>
<div id="canvas-pan-surface" hidden={true} aria-hidden="true">
</div>
</div>
</div>
</div>
<div className="viewbar" aria-label="画布视图">
<div className="view-tools">
<button id="dock-add-page" title="添加页面">{"⊕ "}<span>{"添加页面"}</span>
</button>
<button id="dock-delete-page" aria-label="删除当前页" title="删除当前页">{"♜"}</button>
</div>
<div className="view-tools">
<button id="zoom-out" aria-label="缩小画布">{"−"}</button>
<select id="canvas-zoom" aria-label="画布缩放">
<option value="fit">{"适合窗口"}</option>
<option value="0.25">{"25%"}</option>
<option value="0.5">{"50%"}</option>
<option value="0.75">{"75%"}</option>
<option value="1">{"100%"}</option>
<option value="1.5">{"150%"}</option>
<option value="2">{"200%"}</option>
</select>
<button id="zoom-in" aria-label="放大画布">{"＋"}</button>
<details className="view-menu" hidden={true}>
<div>
<button id="pan-canvas" aria-pressed="false" title="拖动画布视图，不移动页面中的对象；再次点击或按 Esc 退出">{"平移画布"}</button>
<button id="focus-canvas" aria-pressed="false" title="暂时收起侧栏和讲稿，再次点击恢复">{"收起侧栏"}</button>
<button id="toggle-pages" aria-controls="page-panel" hidden={true}>{"页面"}</button>
<button id="toggle-inspector" aria-controls="property-panel" hidden={true}>{"属性"}</button>
</div>
</details>
</div>
<div className="view-tools">
<button id="dock-previous-page" aria-label="上一页">{"◀"}</button>
<span id="page-position" className="page-position">
</span>
<button id="dock-next-page" aria-label="下一页">{"▶"}</button>
</div>
<div className="view-tools">
<button id="toggle-comments" aria-controls="comments-panel" aria-expanded="false" aria-pressed="false" title="批注" aria-label="批注">{"💬"}</button>
<button id="toggle-notes" aria-controls="notes-panel" aria-expanded="false" title="讲稿" aria-label="讲稿">{"▤"}</button>
</div>
</div>
<button id="interact" className="mode-switch" aria-label="预览讲义" aria-pressed="false" title="预览讲义">
<span className="mode-pencil">{"✎"}</span>
<span className="mode-eye">{"◉"}</span>
</button>
<div id="notes-panel" className="bottom-panel">
<label>{"演讲者备注"}<textarea id="notes" rows={3} placeholder="这页要讲什么？">
</textarea>
</label>
<button id="save-notes">{"保存备注"}</button>
<button id="speaker">{"演讲者模式 ↗"}</button>
<div id="timeline" className="timeline">
</div>
</div>
</section>
<aside id="property-panel" className="inspector" aria-label="编辑属性">
<div className="inspector-heading" hidden={true}>
<span>{"编辑工具"}</span>
<button id="close-inspector" aria-label="关闭编辑工具">{"×"}</button>
</div>
<div className="tabs" hidden={true}>
<button data-tab="objects" className="active">{"对象"}</button>
<button data-tab="format">{"格式"}</button>
<button data-tab="animation">{"动画"}</button>
</div>
<section data-panel="objects">
<p className="hint">{"点选画布或对象列表。按住 Shift 可多选。"}</p>
<div id="objects">
</div>
</section>
<section data-panel="format" hidden={true}>
<div className="selection-name" id="selection-name">{"未选择对象"}</div>
<label>{"文字"}<textarea id="object-text" rows={3}>
</textarea>
</label>
<button id="apply-text">{"应用文字"}</button>
<div className="field-grid">
<label>{"字号"}<input id="font-size" type="number" min="1" defaultValue="32" />
</label>
<label>{"颜色"}<input id="color" type="color" defaultValue="#263449" />
</label>
<label>{"X 偏移"}<input id="tx" type="number" defaultValue="0" />
</label>
<label>{"Y 偏移"}<input id="ty" type="number" defaultValue="0" />
</label>
<label>{"旋转"}<input id="rotation" type="number" defaultValue="0" />
</label>
<label>{"缩放"}<input id="scale" type="number" step="0.1" defaultValue="1" />
</label>
<label>{"宽度"}<input id="object-width" type="number" min="1" />
</label>
<label>{"高度"}<input id="object-height" type="number" min="1" />
</label>
</div>
<button id="apply-format">{"应用格式"}</button>
<div id="layout-item-tools" className="inline" hidden={true}>
<button id="layout-item-duplicate">{"复制这一项"}</button>
<button id="layout-item-delete">{"删除这一项"}</button>
</div>
<label id="cycle-count-field" hidden={true}>{"循环项数"}<input id="cycle-count" type="number" min="3" max="6" step="1" defaultValue="3" />
</label>
<label>
<input id="text-reflow" type="checkbox" defaultChecked={true} />{" 文字框调整尺寸时保持字号"}</label>
<div className="inline">
<button id="bold">{"加粗"}</button>
<button id="italic">{"斜体"}</button>
<button id="lock">{"锁定 / 解锁"}</button>
<button id="front">{"置顶"}</button>
<button id="back">{"置底"}</button>
<button id="layer-forward" disabled={true}>{"上移一层"}</button>
<button id="layer-backward" disabled={true}>{"下移一层"}</button>
</div>
<fieldset id="connector-panel" hidden={true}>
<legend>{"对象连接线"}</legend>
<p>{"拖动圆形端点连接对象或空白位置；按住 Alt 可强制使用自由端点。"}</p>
<div id="connector-start-point" hidden={true}>
<label>{"X"}<input id="connector-start-x" type="number" step="any" />
</label>
<label>{"Y"}<input id="connector-start-y" type="number" step="any" />
</label>
</div>
<label>{"起点对象"}<select id="connector-start">
</select>
</label>
<label>{"起点位置"}<select id="connector-start-anchor">
<option value="auto">{"自动"}</option>
<option value="top">{"上边"}</option>
<option value="right">{"右边"}</option>
<option value="bottom">{"下边"}</option>
<option value="left">{"左边"}</option>
</select>
</label>
<div id="connector-end-point" hidden={true}>
<label>{"X"}<input id="connector-end-x" type="number" step="any" />
</label>
<label>{"Y"}<input id="connector-end-y" type="number" step="any" />
</label>
</div>
<label>{"终点对象"}<select id="connector-end">
</select>
</label>
<label>{"终点位置"}<select id="connector-end-anchor">
<option value="auto">{"自动"}</option>
<option value="top">{"上边"}</option>
<option value="right">{"右边"}</option>
<option value="bottom">{"下边"}</option>
<option value="left">{"左边"}</option>
</select>
</label>
<label>{"线形"}<select id="connector-kind">
<option value="straight">{"直线"}</option>
<option value="elbow">{"折线"}</option>
<option value="curve">{"曲线"}</option>
</select>
</label>
<label>{"颜色"}<input id="connector-color" defaultValue="#466ddb" />
</label>
<label>{"线宽"}<input id="connector-width" type="number" min=".5" max="30" step=".5" />
</label>
<label>{"线条"}<select id="connector-dash">
<option value="solid">{"实线"}</option>
<option value="dashed">{"虚线"}</option>
<option value="dotted">{"点线"}</option>
</select>
</label>
<label>
<input id="connector-start-arrow" type="checkbox" />{"起点箭头"}</label>
<label>
<input id="connector-end-arrow" type="checkbox" />{"终点箭头"}</label>
<button id="save-connector">{"应用连接线"}</button>
</fieldset>
<fieldset id="scene-panel" hidden={true}>
<legend>{"互动场景参数"}</legend>
<p id="scene-status" className="hint">{"\n              读取当前互动状态后，可以保存本次采样和修改启动参数。\n            "}</p>
<label>{"状态组"}<select id="scene-choice">
</select>
</label>
<button id="select-scene-root" hidden={true}>{"选择完整互动区域"}</button>
<button id="read-scene">{"读取当前互动状态"}</button>
<div id="scene-parameters">
</div>
<button id="save-scene" disabled={true}>{"保存场景参数"}</button>
<button id="reset-scene">{"恢复源稿参数"}</button>
</fieldset>
<fieldset id="native-chart-panel" hidden={true}>
<legend>{"原生图表"}</legend>
<p className="hint" id="native-chart-status">{"读取图表后可编辑序列数据与样式。"}</p>
<button id="inspect-native-chart">{"读取当前图表"}</button>
<label>{"序列"}<select id="native-chart-series">
</select>
</label>
<label>{"序列名称"}<input id="native-chart-name" />
</label>
<label>{"颜色"}<input id="native-chart-color" defaultValue="#466ddb" />
</label>
<label>{"线宽"}<input id="native-chart-width" type="number" min="0" max="50" step=".5" defaultValue="2" />
</label>
<label>
<input id="native-chart-symbols" type="checkbox" />{"显示数据点"}</label>
<label>{"序列数据 JSON"}<textarea id="native-chart-data" rows={5}>{"[]"}</textarea>
</label>
<label>
<input id="native-chart-save-data" type="checkbox" />{"固定为这组数据"}</label>
<button id="save-native-chart-series">{"应用序列编辑"}</button>
<details>
<summary>{"图表配置"}</summary>
<label>{"配置补丁 JSON"}<textarea id="native-chart-option" rows={6}>{"{}"}</textarea>
</label>
<button id="save-native-chart-option">{"应用配置"}</button>
</details>
<button id="reset-native-chart">{"恢复原生图表配置"}</button>
</fieldset>
<label>{"互动初始值"}<input id="binding-value" placeholder="选择滑块、输入框或下拉框" />
</label>
<button id="save-binding">{"保存互动默认值"}</button>
<details>
<summary>{"CSS 与属性"}</summary>
<label>{"CSS JSON"}<textarea id="style-json" rows={4}>{"{}"}</textarea>
</label>
<label>{"属性 JSON"}<textarea id="attrs-json" rows={4}>{"{}"}</textarea>
</label>
<button id="apply-advanced">{"应用"}</button>
</details>
</section>
<section data-panel="animation" hidden={true}>
<div className="stepbar">
<button id="step-prev">{"← 上一步"}</button>
<label>{"讲授步骤 "}<input id="step" type="range" min="0" max="0" defaultValue="0" />
</label>
<output id="step-label">{"0 / 0"}</output>
<button id="step-next">{"下一步 →"}</button>
</div>
<div className="animation-topline">
<strong id="animation-target">{"选择对象，添加动画"}</strong>
<button id="new-animation" title="为所选对象另加一条动画">{"＋ 添加动画"}</button>
</div>
<div id="animation-gallery">
</div>
<div className="animation-preview-actions">
<button id="preview-selected-animation">{"▷ 预览所选"}</button>
<button id="stop-animation-preview" title="停止预览" aria-label="停止预览">{"■"}</button>
<button id="preview-animation">{"播放整页"}</button>
</div>
<div className="animation-list-heading">
<strong>{"动画顺序"}</strong>
<span>{"拖动排序 · 时间条调整计时"}</span>
</div>
<div id="animations">
</div>
<p id="animation-editing">
</p>
<fieldset id="animation-settings">
<legend className="sr-only">{"动画设置"}</legend>
<label>{"效果"}<select id="effect">
<option value="fade-in">{"淡入"}</option>
<option value="draw-stroke">{"描边绘制"}</option>
<option value="appear">{"出现"}</option>
<option value="fly-in">{"飞入"}</option>
<option value="zoom-in">{"缩放进入"}</option>
<option value="fade-out">{"淡出"}</option>
<option value="fly-out">{"飞出"}</option>
<option value="pulse">{"强调 · 脉冲"}</option>
<option value="spin">{"旋转"}</option>
<option value="motion">{"移动路径"}</option>
</select>
</label>
<div className="field-grid">
<label>{"步骤"}<select id="animation-step">
<option value="1">{"1 · 单击步骤"}</option>
</select>
</label>
<label>{"时长（秒）"}<input id="duration" type="number" min="0" max="60" step="0.05" defaultValue="0.6" />
</label>
<label>{"延迟（秒）"}<input id="delay" type="number" min="0" max="60" step="0.05" defaultValue="0" />
</label>
<label>{"水平位移"}<input id="dx" type="number" defaultValue="120" />
</label>
</div>
<label>{"开始方式"}<select id="trigger">
<option value="click">{"单击时（本步骤）"}</option>
<option value="with-previous">{"与上一动画同时"}</option>
<option value="after-previous">{"上一动画之后"}</option>
<option value="object">{"点击指定对象"}</option>
</select>
</label>
<label>{"触发对象"}<select id="trigger-target">
</select>
</label>
</fieldset>
<button id="add-animation" hidden={true}>{"添加动画"}</button>
<button id="save-animation" hidden={true} disabled={true}>{"更新所选动画"}</button>
</section>
<section id="global-style" hidden={true}>
<span className="settings-scope">{"全局样式"}</span>
<section className="global-settings-section">
<h3>{"页面尺寸"}</h3>
<div className="field-grid">
<label>{"宽度"}<input id="deck-width" type="number" min="100" max="10000" step="1" />
</label>
<label>{"高度"}<input id="deck-height" type="number" min="100" max="10000" step="1" />
</label>
</div>
<p className="hint">{"作用于整份讲义，元素保持原尺寸与位置。"}</p>
<button id="save-deck-size">{"应用尺寸"}</button>
<p id="deck-size-status" role="status">
</p>
</section>
<section className="global-settings-section">
<h3>{"主题"}</h3>
<button id="open-theme-settings">{"高级主题设置…"}</button>
<p className="hint">{"调整讲义的主题变量，页面自身的样式优先。"}</p>
</section>
<section id="global-master-mount">
</section>
<details id="guide-settings">
<summary>{"参考线与吸附"}</summary>
<p className="hint">{"\n              移动：Alt 暂停吸附，Shift 限制方向。缩放：Ctrl/⌘ 暂停吸附，Alt 从中心缩放，Shift\n              等比。Esc 取消。\n            "}</p>
<label>
<input id="snap-enabled" type="checkbox" defaultChecked={true} />{" 吸附到对象、页面和参考线"}</label>
<label>
<input id="rulers-visible" type="checkbox" />{" 显示标尺（拖出参考线）"}</label>
<label>
<input id="guides-visible" type="checkbox" defaultChecked={true} />{" 显示参考线"}</label>
<label>{"网格间距（0 关闭）"}<input id="snap-grid" type="number" min="0" max="10000" defaultValue="0" />
</label>
<div className="field-grid">
<label>{"方向"}<select id="guide-axis">
<option value="x">{"垂直 X"}</option>
<option value="y">{"水平 Y"}</option>
</select>
</label>
<label>{"页面坐标"}<input id="guide-position" type="number" defaultValue="100" step="any" />
</label>
</div>
<button id="add-guide">{"添加参考线"}</button>
<div id="guide-list">
</div>
</details>
<label>{"历史版本"}<select id="history">
</select>
</label>
<button id="restore">{"恢复所选版本"}</button>
</section>
</aside>
</main>);}

function EditorAuxiliary1(){return (<input id="media-file" type="file" hidden={true} />);}

function EditorAuxiliary2(){return (<div id="toast" role="alert" hidden={true}>
</div>);}
export function EditorChrome(){return <>
<ActivityBar />
<EditorHeader />
<EditorWorkspace />
<EditorAuxiliary1 />
<EditorAuxiliary2 />
</>;}
