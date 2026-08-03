import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sourceDir = path.join(root, 'examples', 'data-structures-20');
const sourceFile = path.join(sourceDir, 'project.json');
const stylePreset = process.argv[2] || 'dark-data-editorial';
const seed = Number(process.argv[3] || 20260819);
const promptProfile = process.argv[4] || 'seedream-native-v3';
if (!/^[a-z0-9-]+$/i.test(stylePreset)) throw new Error(`无效 style preset: ${stylePreset}`);
if (!Number.isFinite(seed)) throw new Error(`无效 seed: ${process.argv[3]}`);
if (!['seedream-native-v3', 'seedream-native-v4-copy-isolated'].includes(promptProfile)) {
  throw new Error(`无效 prompt profile: ${promptProfile}`);
}

const proof = ({ pageType, layoutId, archetype, exactText, copyPlan, seedreamBrief }) => ({
  pageType,
  layoutId,
  archetype,
  semanticLocks: { exactText, copyPlan },
  imageIntent: { seedreamBrief },
});

const PAGE_PROOFS = {
  'page-001': proof({
    pageType: 'cover', layoutId: 'cover-hero-path', archetype: '树到图的课程封面',
    exactText: ['数据结构：从树到图', '关系 × 约束 × 操作 × 复杂度'],
    copyPlan: [
      { role: '主标题', position: '左侧超大字号，两行以内', text: '数据结构：从树到图' },
      { role: '副标题', position: '主标题下方短横线旁', text: '关系 × 约束 × 操作 × 复杂度' },
    ],
    seedreamBrief: '封面只建立一个主视觉：一条连续路径从左侧简洁树枝逐步展开为右侧网络，路径由疏到密但不做复杂线路板。大标题占左上大块留白，副标题靠近标题。不要正文、目录、作者和页码。',
  }),
  'page-002': proof({
    pageType: 'concept', layoutId: 'concept-orbit', archetype: '三种关系形态概念页',
    exactText: ['数据结构首先是在组织关系', '线性', '层级', '网络', '对象本身不决定结构，对象之间的关系才决定结构。'],
    copyPlan: [
      { role: '主标题', position: '左上方大字号', text: '数据结构首先是在组织关系' },
      { role: '关系一', position: '贴近单线序列', text: '线性' },
      { role: '关系二', position: '贴近分叉层级', text: '层级' },
      { role: '关系三', position: '贴近多路径网络', text: '网络' },
      { role: '底部结论', position: '横贯底部', text: '对象本身不决定结构，对象之间的关系才决定结构。' },
    ],
    seedreamBrief: '标题位于左上。主体由同一组三个无字对象连续变形：先排成一条线，再形成一棵分叉树，最后展开成小型网络；三种状态不是三张卡片，而是一条从左到右的形态演化。三个短标签贴近对应状态，底部一句结论。',
  }),
  'page-003': proof({
    pageType: 'concept', layoutId: 'concept-orbit', archetype: '术语围绕关系主图',
    exactText: ['三个词读懂关系结构', '节点', '边', '路径', '节点、边、路径是树与图的共同语言。'],
    copyPlan: [
      { role: '主标题', position: '左上方大字号', text: '三个词读懂关系结构' },
      { role: '术语一', position: '贴近唯一高亮圆点', text: '节点' },
      { role: '术语二', position: '贴近唯一高亮连接线', text: '边' },
      { role: '术语三', position: '贴近唯一连续高亮路线', text: '路径' },
      { role: '底部结论', position: '居中', text: '节点、边、路径是树与图的共同语言。' },
    ],
    seedreamBrief: '主体是一张大型、简洁、准确的六节点关系图，占画面中部；一个节点、一条边和一条跨越多个节点的连续路径分别被强调。三个术语像编辑批注一样紧贴对应对象，不做三张并列卡片。',
  }),
  'page-004': proof({
    pageType: 'definition', layoutId: 'constraint-frame', archetype: '四条约束框定树',
    exactText: ['树是受约束的层级关系', '唯一入口', '连通', '无环', '唯一父节点', '约束越明确，结构支持的操作越可预测。'],
    copyPlan: [
      { role: '主标题', position: '左上方大字号', text: '树是受约束的层级关系' },
      { role: '约束一', position: '中央树上方', text: '唯一入口' },
      { role: '约束二', position: '中央树左侧', text: '连通' },
      { role: '约束三', position: '中央树右侧', text: '无环' },
      { role: '约束四', position: '中央树下方', text: '唯一父节点' },
      { role: '底部结论', position: '居中加粗', text: '约束越明确，结构支持的操作越可预测。' },
    ],
    seedreamBrief: '一个极简无字树形位于中央，四条约束从上、左、右、下共同框定它。每条约束只出现一次，不做四张卡片，不添加定义正文。',
  }),
  'page-005': proof({
    pageType: 'diagram', layoutId: 'diagram-hero-annotated', archetype: '六节点树结构主图',
    exactText: ['一棵树就是一组确定的父子关系', 'A · 根', 'B', 'C', 'D · 叶', 'E · 叶', 'F · 叶', '父子边决定层级，叶子节点终止分支。'],
    copyPlan: [
      { role: '主标题', position: '左上方大字号', text: '一棵树就是一组确定的父子关系' },
      { role: '根节点', position: '树形顶部', text: 'A · 根' },
      { role: '第二层左', position: 'A 左下', text: 'B' },
      { role: '第二层右', position: 'A 右下', text: 'C' },
      { role: '叶节点一', position: 'B 左下', text: 'D · 叶' },
      { role: '叶节点二', position: 'B 右下', text: 'E · 叶' },
      { role: '叶节点三', position: 'C 正下', text: 'F · 叶' },
      { role: '底部结论', position: '居中', text: '父子边决定层级，叶子节点终止分支。' },
    ],
    seedreamBrief: '主体严格是一棵六节点树，A 连接 B、C；B 连接 D、E；C 连接 F，严格只有五条边。树占画面约三分之二，节点标签贴近节点，连线短而连续。',
  }),
  'page-006': proof({
    pageType: 'data', layoutId: 'metric-asymmetric-band', archetype: '三指标尺度带',
    exactText: ['三项指标压缩一棵树的形状', '节点数 6', '树高 3', '最大度 2', '指标把肉眼看到的结构转化为可比较的量。'],
    copyPlan: [
      { role: '主标题', position: '左上方大字号', text: '三项指标压缩一棵树的形状' },
      { role: '主指标', position: '左侧最大字号数字', text: '节点数 6' },
      { role: '指标二', position: '中部尺度带', text: '树高 3' },
      { role: '指标三', position: '右侧尺度带', text: '最大度 2' },
      { role: '底部结论', position: '居中', text: '指标把肉眼看到的结构转化为可比较的量。' },
    ],
    seedreamBrief: '以“节点数 6”为最大视觉锚点；树高和最大度沿一条从左下到右上的不对称尺度带排列。用简洁树形轮廓辅助理解，不做仪表盘、图表坐标轴或三张等宽卡片。',
  }),
  'page-007': proof({
    pageType: 'concept', layoutId: 'nested-recursion', archetype: '子树同构递归页',
    exactText: ['递归来自子树的同构', '当前节点', '处理子树', '叶子终止', '大问题可以拆成同类型的小问题。'],
    copyPlan: [
      { role: '主标题', position: '左上方大字号', text: '递归来自子树的同构' },
      { role: '步骤一', position: '大树根附近', text: '当前节点' },
      { role: '步骤二', position: '被放大的子树附近', text: '处理子树' },
      { role: '步骤三', position: '叶节点附近', text: '叶子终止' },
      { role: '底部结论', position: '居中', text: '大问题可以拆成同类型的小问题。' },
    ],
    seedreamBrief: '画面主体是一棵大树，其中一个分支被放大为结构相同的小树，再在小树中突出叶节点。通过嵌套尺度解释递归，只保留三个短标签。',
  }),
  'page-008': proof({
    pageType: 'comparison', layoutId: 'comparison-dual-worlds', archetype: '同树双路径对照',
    exactText: ['遍历是在决定访问顺序', '深度优先', '栈 / 递归', '广度优先', '队列', '结构不变，访问策略决定计算过程。'],
    copyPlan: [
      { role: '主标题', position: '左上方大字号', text: '遍历是在决定访问顺序' },
      { role: '左侧标题', position: '左侧树上方', text: '深度优先' },
      { role: '左侧工具', position: '左侧树下方', text: '栈 / 递归' },
      { role: '右侧标题', position: '右侧树上方', text: '广度优先' },
      { role: '右侧工具', position: '右侧树下方', text: '队列' },
      { role: '底部结论', position: '居中加粗', text: '结构不变，访问策略决定计算过程。' },
    ],
    seedreamBrief: '左右画同一棵五节点树。左侧用一条深入再回退的连续路径，右侧用三条横向波带逐层展开；两侧形态明显不同，中间不放表格。',
  }),
  'page-009': proof({
    pageType: 'code', layoutId: 'code-stage-callouts', archetype: '深度优先代码走读',
    exactText: ['深度优先：先深入，再回退', 'visit(node)', 'dfs(child)', '当前节点', '继续深入', '回退', '访问当前节点，然后递归访问每棵子树。'],
    copyPlan: [
      { role: '主标题', position: '左上方大字号', text: '深度优先：先深入，再回退' },
      { role: '代码一', position: '中央代码块第一行', text: 'visit(node)' },
      { role: '代码二', position: '中央代码块第二行', text: 'dfs(child)' },
      { role: '注释一', position: '第一行左侧', text: '当前节点' },
      { role: '注释二', position: '第二行右侧', text: '继续深入' },
      { role: '注释三', position: '回转箭头末端', text: '回退' },
      { role: '底部结论', position: '居中', text: '访问当前节点，然后递归访问每棵子树。' },
    ],
    seedreamBrief: '中央只有两行超大真实代码，沿阅读方向用一条深入并回转的路径连接三个执行注释。不要 IDE 外框、行号、额外代码或终端窗口。',
  }),
  'page-010': proof({
    pageType: 'process', layoutId: 'process-journey', archetype: '队列层序推进',
    exactText: ['广度优先：一层一层推进', '入队', '取出', '扩展', '把起点入队，重复取出队首并加入未访问邻居。'],
    copyPlan: [
      { role: '主标题', position: '左上方大字号', text: '广度优先：一层一层推进' },
      { role: '阶段一', position: '队列左端', text: '入队' },
      { role: '阶段二', position: '队列中央出口', text: '取出' },
      { role: '阶段三', position: '右侧分支波面', text: '扩展' },
      { role: '底部结论', position: '居中', text: '把起点入队，重复取出队首并加入未访问邻居。' },
    ],
    seedreamBrief: '主体是一条从左向右的连续队列管道：一个对象入队、从队首取出、再向右展开为下一层多个对象。三个阶段形态不同且只出现一次，不画代码窗口。',
  }),
  'page-011': proof({
    pageType: 'comparison', layoutId: 'comparison-dual-worlds', archetype: 'DFS 与 BFS 成本对照',
    exactText: ['DFS 与 BFS 的成本来自保存边界', 'DFS 时间 O(V+E)', '栈 / 递归', 'BFS 时间 O(V+E)', '队列', '时间复杂度相同，空间峰值取决于结构形状。'],
    copyPlan: [
      { role: '主标题', position: '左上方大字号', text: 'DFS 与 BFS 的成本来自保存边界' },
      { role: '左侧指标', position: '左侧纵深路径上方', text: 'DFS 时间 O(V+E)' },
      { role: '左侧工具', position: '左侧路径下方', text: '栈 / 递归' },
      { role: '右侧指标', position: '右侧层级波面上方', text: 'BFS 时间 O(V+E)' },
      { role: '右侧工具', position: '右侧波面下方', text: '队列' },
      { role: '底部结论', position: '居中加粗', text: '时间复杂度相同，空间峰值取决于结构形状。' },
    ],
    seedreamBrief: '左侧用窄而深的纵向路径表达 DFS 保存边界，右侧用宽而浅的横向波面表达 BFS 保存边界；两个 O(V+E) 同样醒目，空间形态形成对照。不要表格和仪表盘。',
  }),
  'page-012': proof({
    pageType: 'definition', layoutId: 'constraint-frame', archetype: '二叉搜索树不变量',
    exactText: ['二叉搜索树把顺序写进结构', '左侧更小', '当前节点', '右侧更大', '有序不变量把比较结果转化为路径选择。'],
    copyPlan: [
      { role: '主标题', position: '左上方大字号', text: '二叉搜索树把顺序写进结构' },
      { role: '左侧规则', position: '中央节点左下', text: '左侧更小' },
      { role: '中心', position: '画面中央', text: '当前节点' },
      { role: '右侧规则', position: '中央节点右下', text: '右侧更大' },
      { role: '底部结论', position: '居中', text: '有序不变量把比较结果转化为路径选择。' },
    ],
    seedreamBrief: '一个大型中心节点建立判断轴，左侧分支逐渐缩小，右侧分支逐渐放大；左右空间明显分开，规则标签紧贴对应分支，不画三张卡片。',
  }),
  'page-013': proof({
    pageType: 'process', layoutId: 'process-journey', archetype: '二叉搜索树插入路径',
    exactText: ['插入就是沿比较路径找到空位', '8', '3', '10', '6', '7 · 新', '每次比较只选择一个方向，直到遇到空链接。'],
    copyPlan: [
      { role: '主标题', position: '左上方大字号', text: '插入就是沿比较路径找到空位' },
      { role: '根节点', position: '树形顶部', text: '8' },
      { role: '左节点', position: '8 左下', text: '3' },
      { role: '右节点', position: '8 右下', text: '10' },
      { role: '比较节点', position: '3 右下', text: '6' },
      { role: '新节点', position: '6 右下并高亮', text: '7 · 新' },
      { role: '底部结论', position: '居中', text: '每次比较只选择一个方向，直到遇到空链接。' },
    ],
    seedreamBrief: '严格画一棵五节点二叉搜索树：8 的左子为 3、右子为 10；3 的右子为 6；6 的右子为新节点 7。用一条连续高亮比较路径 8→3→6→7，其余连线退后。',
  }),
  'page-014': proof({
    pageType: 'comparison', layoutId: 'comparison-dual-worlds', archetype: '平衡树与退化链对照',
    exactText: ['不平衡会把树退化成链', '平衡树 O(log n)', '退化树 O(n)', '限制高度', '平衡的本质是限制最长路径。'],
    copyPlan: [
      { role: '主标题', position: '左上方大字号', text: '不平衡会把树退化成链' },
      { role: '左侧标题', position: '紧凑平衡树上方', text: '平衡树 O(log n)' },
      { role: '右侧标题', position: '细长链上方', text: '退化树 O(n)' },
      { role: '判断轴', position: '两者之间', text: '限制高度' },
      { role: '底部结论', position: '居中加粗', text: '平衡的本质是限制最长路径。' },
    ],
    seedreamBrief: '左侧是一棵矮而宽的七节点平衡树，右侧是同样七个节点组成的极细长单链；两种高度形成强烈形态对照，中间只有一个高度判断轴。',
  }),
  'page-015': proof({
    pageType: 'diagram', layoutId: 'diagram-hero-annotated', archetype: '最大堆结构主图',
    exactText: ['堆只承诺父子优先级', '9 · 最大', '7', '8', '2', '5', '3', '较弱的不变量换来高效的极值访问。'],
    copyPlan: [
      { role: '主标题', position: '左上方大字号', text: '堆只承诺父子优先级' },
      { role: '根节点', position: '堆顶部并最大强调', text: '9 · 最大' },
      { role: '第二层左', position: '9 左下', text: '7' },
      { role: '第二层右', position: '9 右下', text: '8' },
      { role: '第三层一', position: '7 左下', text: '2' },
      { role: '第三层二', position: '7 右下', text: '5' },
      { role: '第三层三', position: '8 左下', text: '3' },
      { role: '底部结论', position: '居中', text: '较弱的不变量换来高效的极值访问。' },
    ],
    seedreamBrief: '严格画六节点最大堆：9 连接 7、8；7 连接 2、5；8 连接 3。根节点 9 视觉最大，父子层级清楚；不要额外节点、数组、排序箭头或数字。',
  }),
  'page-016': proof({
    pageType: 'process', layoutId: 'process-journey', archetype: '树到图的约束放宽',
    exactText: ['图放宽了树的约束', '树：唯一父节点', '图：多入口', '环', '多路径', '树是图的一种特殊情况，图描述更一般的网络关系。'],
    copyPlan: [
      { role: '主标题', position: '左上方大字号', text: '图放宽了树的约束' },
      { role: '起始状态', position: '左侧树形上方', text: '树：唯一父节点' },
      { role: '转化状态', position: '右侧网络上方', text: '图：多入口' },
      { role: '新增能力一', position: '右侧闭合路线旁', text: '环' },
      { role: '新增能力二', position: '右侧两条路线旁', text: '多路径' },
      { role: '底部结论', position: '居中', text: '树是图的一种特殊情况，图描述更一般的网络关系。' },
    ],
    seedreamBrief: '画面是一条从左到右的连续演化：左侧严格树形逐步增加横向连接，最终成为有环和多路径的右侧网络。用两个局部强调分别指出环和多路径，不做两张静态卡片。',
  }),
  'page-017': proof({
    pageType: 'comparison', layoutId: 'comparison-dual-worlds', archetype: '邻接表与邻接矩阵权衡',
    exactText: ['图的表示取决于边的密度', '邻接表', '稀疏图', '邻接矩阵', '稠密图', '空间成本', '查边速度', '空间成本与查边速度之间需要权衡。'],
    copyPlan: [
      { role: '主标题', position: '左上方大字号', text: '图的表示取决于边的密度' },
      { role: '左侧标题', position: '稀疏结构上方', text: '邻接表' },
      { role: '左侧短注', position: '邻接表下方', text: '稀疏图' },
      { role: '右侧标题', position: '矩阵结构上方', text: '邻接矩阵' },
      { role: '右侧短注', position: '邻接矩阵下方', text: '稠密图' },
      { role: '中央左标签', position: '权衡轴左侧', text: '空间成本' },
      { role: '中央右标签', position: '权衡轴右侧', text: '查边速度' },
      { role: '底部结论', position: '居中加粗', text: '空间成本与查边速度之间需要权衡。' },
    ],
    seedreamBrief: '左侧必须是六行无字邻接列表，每行一个大圆点连接一到三个小圆点；右侧是六乘六无数字色块矩阵；中间用一条倾斜权衡轴表达空间成本与查边速度。',
  }),
  'page-018': proof({
    pageType: 'diagram', layoutId: 'diagram-hero-annotated', archetype: '六节点最短路径主图',
    exactText: ['最短路径是在累积代价中做选择', 'S · 0', 'A · 2', 'B · 5', 'C · 4', 'D · 7', 'T · 8', '局部最小的确定顺序逐步构成全局最短路径。'],
    copyPlan: [
      { role: '主标题', position: '左上方大字号', text: '最短路径是在累积代价中做选择' },
      { role: '起点', position: '网络最左侧', text: 'S · 0' },
      { role: '节点一', position: 'S 右上', text: 'A · 2' },
      { role: '节点二', position: 'S 右下', text: 'B · 5' },
      { role: '节点三', position: '画面中上', text: 'C · 4' },
      { role: '节点四', position: '画面中下', text: 'D · 7' },
      { role: '终点', position: '网络最右侧', text: 'T · 8' },
      { role: '底部结论', position: '居中', text: '局部最小的确定顺序逐步构成全局最短路径。' },
    ],
    seedreamBrief: '主体严格是六节点网络：S 连接 A、B；A 连接 C；B 连接 D；C、D 都连接 T。唯一高亮最短路径为 S→A→C→T，其余边降低对比。不要边权文字、额外节点或复杂交叉。',
  }),
  'page-019': proof({
    pageType: 'decision', layoutId: 'decision-branches', archetype: '结构选择决策树',
    exactText: ['选结构先问四个问题', '关系形态', '核心操作', '数据规模', '更新模式', '搜索树', '堆', '普通图', '线性结构', '不存在脱离场景的最佳数据结构。'],
    copyPlan: [
      { role: '主标题', position: '左上方大字号', text: '选结构先问四个问题' },
      { role: '判断一', position: '决策起点上方', text: '关系形态' },
      { role: '判断二', position: '决策起点左侧', text: '核心操作' },
      { role: '判断三', position: '决策起点右侧', text: '数据规模' },
      { role: '判断四', position: '决策起点下方', text: '更新模式' },
      { role: '结果一', position: '第一分支终点', text: '搜索树' },
      { role: '结果二', position: '第二分支终点', text: '堆' },
      { role: '结果三', position: '第三分支终点', text: '普通图' },
      { role: '结果四', position: '第四分支终点', text: '线性结构' },
      { role: '底部结论', position: '居中加粗', text: '不存在脱离场景的最佳数据结构。' },
    ],
    seedreamBrief: '主体是一个无回环决策树：中央起点周围有四个判断维度，再用四条短而不交叉的分支分别到达搜索树、堆、普通图、线性结构。不要流程回线和额外结果。',
  }),
  'page-020': proof({
    pageType: 'summary', layoutId: 'summary-constellation', archetype: '四词课程收束',
    exactText: ['把结构选择变成可复述的判断', '关系', '约束', '操作', '复杂度', '先识别关系，再选择结构，最后选择算法。'],
    copyPlan: [
      { role: '主标题', position: '左上方大字号', text: '把结构选择变成可复述的判断' },
      { role: '关键词一', position: '中心节点正上方', text: '关系' },
      { role: '关键词二', position: '中心节点正左方', text: '约束' },
      { role: '关键词三', position: '中心节点正右方', text: '操作' },
      { role: '关键词四', position: '中心节点正下方', text: '复杂度' },
      { role: '底部结论', position: '居中', text: '先识别关系，再选择结构，最后选择算法。' },
    ],
    seedreamBrief: '标题位于左上。主体是一个大型十字形四向中心节点，外围严格只有上、左、右、下四个端点，各绑定一个关键词；不要第五端点、雷达图、坐标轴或额外注释。底部一句结论。',
  }),
};

const ENGLISH_MODEL_BRIEFS = {
  'page-001': 'Use a large title in the upper-left negative space. Build one continuous visual path that begins as a sparse tree branch and gradually becomes a dense network on the right. Place the subtitle directly below the title. No directory, author line, page number, or extra copy.',
  'page-002': 'Place the title at upper left. Use the same three unlabeled objects in one left-to-right transformation: first a single line, then a branching hierarchy, then a compact network. Attach the three short body strings once to the matching states, in listed order. Put the conclusion across the bottom. Do not use three cards.',
  'page-003': 'Place the title at upper left. Draw one clean six-node relationship graph in the center. Highlight exactly one node, exactly one edge, and exactly one continuous multi-edge path using three distinct treatments. Place the three short body strings once near those exact features, in listed order. Use no callout paragraphs, tiny annotations, legends, or repeated labels. Put the conclusion at the bottom.',
  'page-004': 'Place the title at upper left. Draw one small unlabeled tree in the center. Arrange the four constraint strings once around it at top, left, right, and bottom, in listed order, so they visually frame the tree. Use no cards and no additional definition text. Put the conclusion at the bottom.',
  'page-005': 'Place the title at upper left. Draw exactly six circular nodes and exactly five links as one strict tree: the root has two children; the left child has two leaf children; the right child has one leaf child. Apply the six node-label strings once, in listed tree order. Do not add nodes, branch labels, link labels, small captions, or decorative text. Put the conclusion at the bottom.',
  'page-006': 'Place the title at upper left. Make the first metric string the largest visual anchor on the left. Arrange the other two metric strings along one rising asymmetric scale band with a simple unlabeled tree silhouette on the right. Use each metric string once. Do not draw a chart, axes, tick marks, sequences, extra numbers, duplicate metric names, or cards. Put the conclusion at the bottom.',
  'page-007': 'Place the title at upper left. Show one large tree, then magnify one branch into a self-similar smaller tree, and emphasize one leaf inside it. Attach the three short body strings once to the large root, enlarged subtree, and final leaf, in listed order. No other labels. Put the conclusion at the bottom.',
  'page-008': 'Place the title at upper left. Draw the same five-node tree twice. On the left show one path that goes deep and returns; on the right show broad horizontal waves that visit by levels. Place the two method strings above their matching trees and the two tool strings below, each once in listed order. No table or extra route labels. Put the conclusion at the bottom.',
  'page-009': 'Place the title at upper left. Show only the two exact code strings as two very large lines in the center. Connect three execution callouts along a path that moves inward and returns; apply the three short annotation strings once in listed order. No IDE frame, line numbers, extra code, terminal chrome, or other copy. Put the conclusion at the bottom.',
  'page-010': 'Place the title at upper left. Build one continuous left-to-right queue journey: an object enters a queue, leaves at the head, then expands into the next level. Apply the three stage strings once to those three visual events, in listed order. Do not show stage numbers, code, captions, or additional text. Put the conclusion at the bottom.',
  'page-011': 'Place the title at upper left. On the left use a narrow deep boundary shape for the first method; on the right use a wide shallow wavefront for the second. Place each time-complexity string once above its side and each tool string once below its side, in listed order. Never repeat the complexity expression, abbreviations, or tool labels. Do not use axes or a table. Put the conclusion at the bottom.',
  'page-012': 'Place the title at upper left. Build one large central node as a comparison pivot, with a smaller visual branch on the left and a larger visual branch on the right. Place the three body strings exactly once at left, center, and right, in listed order. Do not add child-direction labels, blank label boxes, comparison notes, or repeated text. Put the conclusion at the bottom.',
  'page-013': 'Place the title at upper left. Draw exactly five circular nodes as one binary-search-tree insertion scene: a root, a left child, a right child, a right child below the left child, and one highlighted new right child below that node. Apply the five node strings once, in listed order. Highlight one continuous comparison path from root to the new node. Do not add child-direction words, comparison sentences, ranges, duplicate values, or extra nodes. Put the conclusion at the bottom.',
  'page-014': 'Place the title at upper left. On the left draw a compact seven-node balanced tree; on the right draw the same number of nodes as one tall chain. Place the two complexity strings once above their matching shapes and the height-control string once on a single central comparison axis. Do not alter the mathematical punctuation, add axis labels, or repeat formulas. Put the conclusion at the bottom.',
  'page-015': 'Place the title at upper left. Draw exactly six circular nodes and exactly five links as one max heap: the root has two children; the left child has two children; the right child has one child. Apply the six node strings once, in listed order. Make the root visually dominant. Do not add nodes, duplicate values, link labels, comparison symbols, arrays, or captions. Put the conclusion at the bottom.',
  'page-016': 'Place the title at upper left. Use one continuous left-to-right transformation: a strict tree gains lateral links and becomes a general network. Apply the tree-state string once above the left state and the graph-state string once above the right state. Use the remaining two short strings once to mark one closed loop and two alternative paths. Do not repeat either term, add ellipses, or add labels. Put the conclusion at the bottom.',
  'page-017': 'Place the title at upper left. On the left draw exactly six rows of an unlabeled adjacency-list visual, each row using one large circle, a short line, and one to three small circles. On the right draw an exact six-by-six matrix using only colored cells and no numbers. Place the two representation strings and their two density strings once above the matching structures, in listed order. Place the two trade-off strings once at the ends of one central balance axis. No extra labels. Put the conclusion at the bottom.',
  'page-018': 'Place the title at upper left. Draw exactly six circular nodes and exactly six links: the start connects to two nodes; those lead to two different middle nodes; both middle nodes connect to the target. Apply the six node-label strings once, in listed order, without splitting a label into inner and outer copies. Highlight only the upper shortest route. Do not add edge weights, duplicate letters, naked letters, or extra nodes. Put the conclusion at the bottom.',
  'page-019': 'Place the title at upper left. Build one clean non-looping decision structure: four question strings surround one central decision point, and four short non-crossing branches lead to the four outcome strings. Use all eight body strings exactly once in listed groups. Do not number questions, duplicate a question, add branch captions, or add outcomes. Put the conclusion at the bottom.',
  'page-020': 'Place the title at upper left. Build one large four-way cross with one center and exactly four outer endpoints. Place the four keyword strings once at top, left, right, and bottom, in listed order. Do not add a fifth endpoint, radar chart, axes, callouts, or extra text. Put the conclusion at the bottom.',
};

for (const [pageId, modelBrief] of Object.entries(ENGLISH_MODEL_BRIEFS)) {
  PAGE_PROOFS[pageId].imageIntent.modelBrief = modelBrief;
}

const project = JSON.parse(await readFile(sourceFile, 'utf8'));
project.slug = `data-structures-20-style-proof-${stylePreset}`;
project.design = path.resolve(sourceDir, project.design);
project.materials = project.materials.map(file => path.resolve(sourceDir, file));
project.referenceConcurrency = 4;
project.maxRevisions = 0;
project.visualPlanning = {
  ...project.visualPlanning,
  promptSystem: promptProfile,
  stylePreset,
  deckIntent: '用一个稳定但不僵化的视觉系统完成 20 页讲义，跨页面保持视觉 DNA，随教学角色切换空间骨架。',
  assetStrategy: '本轮只验证原生文生图的整套风格稳定、排版多元与文字可靠性，不进入 HTML/PPT 拟合。',
  pageDefaults: {
    ...project.visualPlanning.pageDefaults,
    imageIntent: {
      ...project.visualPlanning.pageDefaults.imageIntent,
      inheritDeckStyle: false,
      avoid: ['网页 UI', '仪表盘', '等权卡片墙', '伪文字', '无关人物', '随机编号', 'logo', '水印'],
    },
  },
  pages: PAGE_PROOFS,
};
project.providers.reference = {
  ...project.providers.reference,
  promptProfile,
  envFile: path.resolve(sourceDir, project.providers.reference.envFile),
  guidanceScale: 8,
  seed,
};

const outDir = path.join(root, 'runs', 'style-proof-20-configs');
await mkdir(outDir, { recursive: true });
const outFile = path.join(outDir, `${stylePreset}.json`);
await writeFile(outFile, `${JSON.stringify(project, null, 2)}\n`, 'utf8');
process.stdout.write(`${JSON.stringify({ outFile, stylePreset, seed, promptProfile, pageCount: project.pages.length }, null, 2)}\n`);
