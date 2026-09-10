// Lucide icons (ISC) bundled per icon; slides receive plain inline SVG, no runtime.
import {
  Brain, Cpu, Database, Network, GitBranch, Layers, Target, TrendingUp, BarChart3, LineChart, PieChart, Scale,
  Lightbulb, BookOpen, GraduationCap, FlaskConical, Calculator, Sigma, FunctionSquare, Binary, Code, Terminal, Bug,
  CheckCircle2, XCircle, AlertTriangle, Info, HelpCircle, Star, Flag, Clock, Calendar, Users, User, MessageSquare,
  Search, Filter, Shuffle, Repeat, ArrowRight, ArrowLeftRight, Zap, Rocket, Puzzle, Boxes, Table, Image, Globe,
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
export function iconPreview(name: string) {
  return `<svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true" style="${iconStyle}">${iconChildren(name)}</svg>`;
}
