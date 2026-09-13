// Lucide icons (ISC) bundled per icon; slides receive plain inline SVG, no runtime.
import {
  Brain, Cpu, Database, Network, GitBranch, Layers, Target, TrendingUp, BarChart3, LineChart, PieChart, Scale,
  Lightbulb, BookOpen, GraduationCap, FlaskConical, Calculator, Sigma, FunctionSquare, Binary, Code, Terminal, Bug,
  CheckCircle2, XCircle, AlertTriangle, Info, HelpCircle, Star, Flag, Clock, Calendar, Users, User, MessageSquare,
  Search, Filter, Shuffle, Repeat, ArrowRight, ArrowLeftRight, Zap, Rocket, Puzzle, Boxes, Table, Image, Globe,
  ArrowDown, ArrowUp, ArrowUpDown, CornerDownRight, GitMerge, GitCommitHorizontal, Workflow, Share2, Link2,
  Layers2, Grid3x3, List, ListOrdered, Rows3, Columns3, SquareStack, Component, Blocks, Container,
  Sigma as SigmaAlt, Percent, Divide, Equal, Infinity as InfinityIcon, Ruler, Weight, Gauge, Thermometer,
  TrendingDown, Activity, Waves, Dice5, Sparkles, Eye, EyeOff, Lock, Unlock, Play, Pause, RotateCcw,
  Download, Upload, Save, FileText, FolderTree, Archive, Server, HardDrive, Wifi, Bot, Microscope, Atom,
  type IconNode,
} from 'lucide';
const table: [name: string, label: string, node: IconNode][] = [
  ['brain', '大脑', Brain], ['cpu', '处理器', Cpu], ['database', '数据库', Database], ['network', '网络', Network],
  ['git-branch', '分支', GitBranch], ['layers', '层', Layers], ['target', '目标', Target], ['trending-up', '上升', TrendingUp],
  ['bar-chart', '柱状图', BarChart3], ['line-chart', '折线图', LineChart], ['pie-chart', '饼图', PieChart], ['scale', '天平', Scale],
  ['lightbulb', '灯泡', Lightbulb], ['book-open', '书本', BookOpen], ['graduation-cap', '学位帽', GraduationCap], ['flask', '烧瓶', FlaskConical],
  ['calculator', '计算器', Calculator], ['sigma', '求和', Sigma], ['function', '函数', FunctionSquare], ['binary', '二进制', Binary],
  ['code', '代码', Code], ['terminal', '终端', Terminal], ['bug', '缺陷', Bug], ['check-circle', '完成', CheckCircle2],
  ['x-circle', '错误', XCircle], ['alert-triangle', '警告', AlertTriangle], ['info', '信息', Info], ['help-circle', '疑问', HelpCircle],
  ['star', '星标', Star], ['flag', '旗标', Flag], ['clock', '时钟', Clock], ['calendar', '日历', Calendar],
  ['users', '多人', Users], ['user', '用户', User], ['message-square', '对话', MessageSquare], ['search', '搜索', Search],
  ['filter', '筛选', Filter], ['shuffle', '随机', Shuffle], ['repeat', '循环', Repeat], ['arrow-right', '右箭头', ArrowRight],
  ['arrow-left-right', '双向', ArrowLeftRight], ['zap', '闪电', Zap], ['rocket', '火箭', Rocket], ['puzzle', '拼图', Puzzle],
  ['boxes', '模块', Boxes], ['table', '表格', Table], ['image', '图片', Image], ['globe', '地球', Globe],
  ['arrow-down', '下箭头', ArrowDown], ['arrow-up', '上箭头', ArrowUp], ['arrow-up-down', '上下箭头', ArrowUpDown],
  ['corner-down-right', '折向箭头', CornerDownRight], ['git-merge', '合并', GitMerge], ['git-commit', '节点', GitCommitHorizontal],
  ['workflow', '工作流', Workflow], ['share', '分发', Share2], ['link', '链接', Link2],
  ['layers-2', '两层', Layers2], ['grid', '网格', Grid3x3], ['list', '列表', List], ['list-ordered', '编号列表', ListOrdered],
  ['rows', '行', Rows3], ['columns', '列', Columns3], ['square-stack', '堆叠', SquareStack], ['component', '组件', Component],
  ['blocks', '积木', Blocks], ['container', '容器', Container], ['sum-alt', '总和', SigmaAlt], ['percent', '百分比', Percent],
  ['divide', '除法', Divide], ['equal', '等号', Equal], ['infinity', '无穷', InfinityIcon], ['ruler', '标尺', Ruler],
  ['weight', '权重', Weight], ['gauge', '仪表', Gauge], ['thermometer', '温度', Thermometer],
  ['trending-down', '下降', TrendingDown], ['activity', '波动', Activity], ['waves', '波形', Waves],
  ['dice', '随机数', Dice5], ['sparkles', '亮点', Sparkles], ['eye', '可见', Eye], ['eye-off', '隐藏', EyeOff],
  ['lock', '锁定', Lock], ['unlock', '解锁', Unlock], ['play', '播放', Play], ['pause', '暂停', Pause],
  ['rotate', '重置', RotateCcw], ['download', '下载', Download], ['upload', '上传', Upload], ['save', '保存', Save],
  ['file-text', '文档', FileText], ['folder-tree', '目录树', FolderTree], ['archive', '归档', Archive],
  ['server', '服务器', Server], ['hard-drive', '存储', HardDrive], ['wifi', '网络信号', Wifi],
  ['bot', '智能体', Bot], ['microscope', '显微镜', Microscope], ['atom', '原子', Atom],
];
export const icons = table.map(([name, label]) => ({ name, label }));
const byName = new Map(table.map(([name, , node]) => [name, node]));
// Only geometry attributes survive; colour comes from the root <svg> style so
// `element.patch {style:{stroke}}` recolours the whole icon.
const geometry = new Set(['d', 'cx', 'cy', 'r', 'rx', 'ry', 'x', 'y', 'x1', 'y1', 'x2', 'y2', 'width', 'height', 'points']);
export function iconChildren(name: string) {
  const node = byName.get(name);
  if (!node) throw new Error(`Unknown icon ${name}`);
  return node
    .map(([tag, attrs]) => `<${tag}${Object.entries(attrs).filter(([k]) => geometry.has(k)).map(([k, v]) => ` ${k}="${v}"`).join('')}/>`)
    .join('');
}
export const iconStyle = 'fill:none;stroke:#466ddb;stroke-width:2;stroke-linecap:round;stroke-linejoin:round';
// The panel preview inherits the button's colour; `iconStyle` above stays fixed because
// it paints the icon that lands on the slide.
export function iconPreview(name: string) {
  return `<svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true" style="fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round">${iconChildren(name)}</svg>`;
}
