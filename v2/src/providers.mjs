import { spawn } from 'node:child_process';
import { copyFile, mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { escapeHtml, sha256Text } from './lib/io.mjs';
import { proxyAwareFetch, proxyDescriptor } from './lib/network.mjs';
import { MODEL_POLICY } from './model-policy.mjs';
import { researchPlanningContentProvider } from './content-planner.mjs';
import { compileArtDirectedSlidePrompt, compilePlannedImagePrompt, compileResearchGroundedSlidePrompt, compileSeedreamCopyIsolatedPrompt, compileSeedreamNativeSlidePrompt } from './visual-plan.mjs';

function normalizeCommandConfig(config) {
  if (config.mode !== 'command' || !Array.isArray(config.argv) || !config.argv.length) {
    throw new Error('command provider 配置需要非空 argv');
  }
  return config.argv.map(String);
}

async function runCommand(argv, payload, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(argv[0], argv.slice(1), {
      cwd,
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', chunk => { stdout += chunk; });
    child.stderr.on('data', chunk => { stderr += chunk; });
    child.on('error', reject);
    child.on('close', code => {
      if (code !== 0) {
        reject(new Error(`provider command 退出码 ${code}: ${stderr.trim() || '(无 stderr)'}`));
        return;
      }
      try {
        resolve(JSON.parse(stdout));
      } catch (error) {
        reject(new Error(`provider command 输出不是 JSON: ${error.message}`));
      }
    });
    child.stdin.end(`${JSON.stringify(payload)}\n`);
  });
}

export async function callProvider(stage, config, payload, localHandler, cwd) {
  const mode = config?.mode || 'local';
  if (mode === 'local') return localHandler(payload);
  if (mode === 'research-planner') {
    if (stage !== 'content') throw new Error('research-planner provider 仅支持 content 阶段');
    return researchPlanningContentProvider({ ...payload, config, cwd });
  }
  if (mode === 'paratera') {
    if (stage !== 'reference') throw new Error('paratera provider 当前仅支持 reference 阶段');
    return parateraReferenceProvider({ ...payload, config, cwd });
  }
  if (mode === 'openrouter-image') {
    if (stage !== 'reference') throw new Error('openrouter-image provider 当前仅支持 reference 阶段');
    return parateraReferenceProvider({ ...payload, config, cwd });
  }
  if (mode === 'static-image') {
    if (stage !== 'reference') throw new Error('static-image provider 仅支持 reference 阶段');
    return staticImageReferenceProvider({ config, cwd });
  }
  if (mode === 'reference-image') {
    if (stage !== 'page') throw new Error('reference-image provider 仅支持 page 阶段');
    return referenceImagePageProvider(payload);
  }
  if (mode === 'hybrid-reference') {
    if (stage !== 'page') throw new Error('hybrid-reference provider 仅支持 page 阶段');
    return hybridReferencePageProvider(payload);
  }
  if (mode === 'layered-reference') {
    if (stage !== 'page') throw new Error('layered-reference provider 仅支持 page 阶段');
    return layeredReferencePageProvider({ ...payload, config, cwd });
  }
  const argv = normalizeCommandConfig(config);
  const output = await runCommand(argv, { stage, ...payload }, cwd);
  if (!output || typeof output !== 'object') throw new Error(`${stage} provider 没有返回对象`);
  return output;
}

function parseEnv(text) {
  const values = {};
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const match = line.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!match) continue;
    let value = match[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    values[match[1]] = value;
  }
  return values;
}

async function findEnvFile(cwd, configuredPath) {
  if (configuredPath) return path.resolve(cwd, configuredPath);
  let current = path.resolve(cwd);
  while (true) {
    const candidate = path.join(current, '.env');
    try {
      await readFile(candidate, 'utf8');
      return candidate;
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
    const parent = path.dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}

async function providerSecret(config, cwd) {
  const variable = config.apiKeyEnv || 'API_KEY';
  if (process.env[variable]) return process.env[variable];
  const envFile = await findEnvFile(cwd, config.envFile);
  if (!envFile) throw new Error(`未找到 .env；需要变量 ${variable}`);
  const value = parseEnv(await readFile(envFile, 'utf8'))[variable];
  if (!value) throw new Error(`${envFile} 缺少 ${variable}`);
  return value;
}

function semanticLines(page) {
  const lines = [];
  if (page.coreLogic) lines.push(`核心逻辑：${page.coreLogic}`);
  for (const claim of page.claims || []) lines.push(`事实：${claim.text}`);
  if (page.series) {
    lines.push(`数据：${page.series.map(item => `${item.label}=${item.value}`).join('；')}`);
  }
  if (page.graph) {
    lines.push(`节点：${page.graph.nodes.map(node => `${node.id}=${node.label}`).join('；')}`);
    lines.push(`有向边：${page.graph.edges.map(edge => `${edge.from}->${edge.to}`).join('；')}`);
  }
  if (page.code) lines.push(`代码（逐字保留）：\n${page.code.source}`);
  return lines.join('\n');
}

export function buildSeedreamReferencePrompt({ page, design, ledger = [] }) {
  const previous = ledger.length
    ? ledger.map(item => `${item.pageId}:${item.signature || item.emphasis || 'unknown'}`).join('，')
    : '无';
  return `生成一张 16:10 横向教学幻灯片的纯视觉构图参考图，不是最终含文案的幻灯片。

最高优先级约束：画面中不得出现任何文字、汉字、字母、数字、代码、色值、标签、注释、logo 或水印。NO TEXT, NO LETTERS, NO NUMBERS. 所有标题和正文位置只能用无字符的几何色块或细线暗示排版节奏。

以下语义仅供理解，绝对不要把其中的字符画进图片：
页面主题：${page.title}
页面目标：${page.purpose}
${semanticLines(page)}

视觉基调：深色、冷静、精确、编辑式信息图，结构关系优先，留白充足。使用深蓝黑背景、克制的青色与紫色，以及少量金黄色强调；不要显示色值。
构图要求：根据本页语义选择一个强主视觉，避免均匀卡片阵列。若有树结构，严格保持给定节点数量和父子拓扑，但节点只用无字符几何形状表达；若有数据，用三个不同尺度或位置的视觉锚点表达；若有代码，用无字符的行列节奏和递归路径表达。四周保留宽安全边距，重点明确，像顶级信息设计工作室的版式探索。
跨页避重：此前构图为 ${previous}，本页采用明显不同的视觉组织方式。
避免：仪表盘、UI 控件、卡片拼贴、圆角设备外框、素材网站感、发光渐变、无意义装饰、乱码、伪文字。
输出：一张完整画面，只包含背景、几何图形、连线、抽象排版占位与必要的视觉纹理。`;
}

function quotedLines(values) {
  return values.filter(Boolean).map(value => `「${value}」`).join('、');
}

export function buildGordenDensePrompt({ page, design, brief = {}, hasStyleReference = false }) {
  const claims = (page.claims || []).map(claim => claim.text);
  const metrics = (page.series || []).map(item => `${item.label} ${item.value}`);
  const graph = page.graph
    ? `节点 ${page.graph.nodes.map(node => node.label).join('、')}；连线 ${page.graph.edges.map(edge => `${edge.from.toUpperCase()}→${edge.to.toUpperCase()}`).join('、')}`
    : '';
  const exactText = quotedLines([
    brief.section || '01',
    page.title,
    page.purpose,
    ...claims,
    ...metrics,
    brief.bottomBanner,
  ]);
  return `生成一张 16:9 横版、2560×1440、高分辨率的中文 PPT 成品页。

${hasStyleReference ? '输入图片是唯一的排版与完成度参考。只学习其高密度分区、对齐、层级、框架质感和信息组织；禁止复制参考图的文字、品牌、图标和具体内容。' : ''}

【页面角色】高密度技术讲义核心内容页
【核心信息】${page.coreLogic || page.purpose}
【视觉框架】${brief.framework || '中央真实树结构 + 左侧概念轨道 + 右侧指标轨道 + 底部结论横幅'}
【版式结构】
1. 顶部：左上红色章节编号「${brief.section || '01'}」，右侧深藏青超大标题「${page.title}」，标题下细红线；下一行导语「${page.purpose}」。
2. 左侧窄轨：四个上下排列的小型概念模块，每个由线性图标、短标题和一句说明组成；严格对齐，使用细连接线。
3. 中央主视觉：占页面约 55%，绘制清晰、真实、严格准确的树结构；${graph || '用节点与连线表达层级关系'}。禁止增加、删除、复制或改名任何节点；禁止横条堆叠。
4. 右侧指标轨：三张纵向 KPI 卡，依次显示 ${metrics.join('；')}；每张卡含大数字、短标签和克制图标。
5. 底部：深藏青通栏结论横幅，金色小图标，文字「${brief.bottomBanner || page.coreLogic}」。

【页面文字】只允许出现以下字符串，必须逐字照排，不得改写、拆字、重复或增加其它文字：
${exactText}

【整体风格】浅色科技商务信息图；冰白背景，极淡蓝色电路线纹理；深藏青 #08254B，科技蓝 #1464B4，企业红 #D81E06，少量金色 #D9A928。白色模块带细描边、克制阴影和精细对齐；图标为统一的双色扁平线性风格。完成度应达到顶级咨询公司与大型科技公司发布会信息图水准，复杂但一眼可读。

【质量约束】
- 这是完整 PPT 页面，不是网页、仪表盘、设计稿截图或设备模型。
- 文字必须清晰、端正、零乱码；所有中文使用现代无衬线黑体。
- 所有节点、箭头和连线结构必须准确；不允许伪图表或无意义装饰。
- 四周安全边距充足，元素不裁切，不要页码、logo、水印、时间、比例标记或设计说明。
- 满而不乱，标题 > 大数字 > 模块标题 > 正文，严格网格与视觉节奏。`;
}

export function buildGordenRepairPrompt({ page, brief = {} }) {
  const graph = page.graph;
  const claims = page.claims || [];
  const metrics = page.series || [];
  return `以输入图片作为唯一编辑目标。保持现有的冰白科技背景、红蓝金配色、顶部标题区、左中右三栏比例、卡片质感、底部深蓝横幅和整体 16:9 构图不变。只修正中央树结构和所有错误文字；删除一切乱码、伪文字、重复节点、错误节点与参考图残留内容。

必须精确完成以下修改：
1. 顶部只保留章节号「${brief.section || '01'}」、标题「${page.title}」和副标题「${page.purpose}」。
2. 左侧正好四个模块，文字分别是：
   「${claims[0]?.text || ''}」
   「${claims[1]?.text || ''}」
   「${claims[2]?.text || ''}」
   「${claims[3]?.text || ''}」
   每个模块只使用这一个短标题和一句解释，不出现任何更小的辅助文字。
3. 中央只画一棵六节点树：第一层只有 A；第二层只有 B、C；第三层只有 D、E、F。连线严格且仅为 A→B、A→C、B→D、B→E、C→F。节点标签严格为 A、B、C、D、E、F；不得重复，不得添加其它节点，不得双向箭头。
4. 右侧标题改为「结构指标」，正好三张 KPI 卡，不多不少：
   「${metrics[0]?.value} ${metrics[0]?.label}」
   「${metrics[1]?.value} ${metrics[1]?.label}」
   「${metrics[2]?.value} ${metrics[2]?.label}」
   删除「企业落地」、英文、乱码和其它说明。
5. 底部横幅文字严格为「${brief.bottomBanner || ''}」。

文字必须是清晰端正的现代中文黑体。除以上列出的文字、节点字母和数字外，画面中禁止出现任何其它字符。不要改变页面比例，不要裁切元素，不要添加页码、logo、水印、时间或设计说明。`;
}

export function buildGordenDualReferencePrompt({ page, brief = {} }) {
  const metrics = page.series || [];
  return `生成一张 16:9 横版、2560×1440、高分辨率的中文 PPT 成品页。

输入图片有严格分工：
- 图片 1 仅作为视觉风格与版式密度参考：学习其浅色科技商务风格、红蓝金配色、顶部标题区、左右信息轨、中央主视觉、底部深蓝结论带、精细描边与对齐。禁止复制其中的任何文字、品牌、图标、业务概念和具体图形。
- 图片 2 仅作为树结构参考：必须一比一遵守其中 A–F 的节点数量、层级、父子关系和连线方向。忽略图片 2 的深色背景、标题、按钮、页码和其它界面元素。

【页面结构】
1. 顶部：左上红色章节号「${brief.section || '01'}」，右侧深藏青大标题「${page.title}」，下一行副标题「${page.purpose}」。
2. 左侧概念轨：正好四项，依次为「唯一根节点」「单一父节点」「叶子节点」「递归同构」。每项只出现一个短标签，禁止小字说明。
3. 中央主视觉：正好六个节点。第一层只有 A；第二层只有 B、C；第三层只有 D、E、F。连线严格且仅为 A→B、A→C、B→D、B→E、C→F。节点标签严格为 A、B、C、D、E、F，不得重复、增加、删除或改名。
4. 右侧指标轨：标题「结构指标」，正好三张 KPI 卡，依次为「${metrics[0]?.value || 6} 节点」「${metrics[1]?.value || 3} 层」「${metrics[2]?.value || 2} 最大度」。
5. 底部：深藏青通栏结论横幅，只写「${brief.bottomBanner || '先序遍历：A → B → D → E → C → F'}」。

【允许出现的全部文字】
「${brief.section || '01'}」
「${page.title}」
「${page.purpose}」
「唯一根节点」「单一父节点」「叶子节点」「递归同构」
「A」「B」「C」「D」「E」「F」
「结构指标」「${metrics[0]?.value || 6} 节点」「${metrics[1]?.value || 3} 层」「${metrics[2]?.value || 2} 最大度」
「${brief.bottomBanner || '先序遍历：A → B → D → E → C → F'}」

【视觉要求】冰白背景，极淡蓝色技术线纹；深藏青 #08254B、科技蓝 #1464B4、企业红 #D81E06、少量金色 #D9A928。白色信息模块使用细描边、克制阴影、统一双色线性图标。中央树必须是最大视觉锚点，节点清楚、连线无交叉。整体复杂但秩序清楚，达到顶级咨询公司与大型科技公司发布会信息图水平。

【硬性禁止】除允许列表外不得出现任何文字；不得出现乱码、伪文字、英文、参考图残留、logo、水印、页码、时间、按钮、设备外框、网页 UI 或设计说明。所有中文必须清晰端正，四周留足安全边距，任何元素不得裁切。`;
}

export function buildGordenGuidePolishPrompt() {
  return `将输入图片 1 精装修为一张顶级科技公司发布会水准的 16:9 中文 PPT 成品页。输入图片 1 是不可更改的线框母版：所有区域的坐标、尺寸、文字、节点数量、节点位置、节点标签和连线关系必须逐像素级保持。输入图片 2 只提供视觉质感参考，只学习其专业的信息密度、细节、图标语言、描边、阴影和高级感，禁止复制其内容或改变母版布局。

只允许进行视觉精装修：改善冰白科技背景纹理、红蓝金配色层次、边框、阴影、图标细节、节点材质和视觉节奏。必须保留且只保留母版的全部文字。中央树必须仍为六个节点：A 位于第一层；B、C 位于第二层；D、E、F 位于第三层；连线严格且仅为 A→B、A→C、B→D、B→E、C→F。

硬性禁止：移动、重排、增加、删除、复制或改写任何文字和节点；禁止增加第四张 KPI 卡；禁止增加额外树枝、树干、箭头或装饰性连线；禁止乱码、英文标签、logo、水印、页码、按钮、网页 UI、设备外框或设计说明。输出完整 2560×1440 页面，四周不得裁切。`;
}

export function buildGordenCleanPlatePrompt() {
  return `把输入图片转换为同尺寸、同构图的“空白 PPT 框架底板”。必须保持 2560×1440 比例以及下列元素的位置、尺寸、材质、阴影和背景纹理不变：冰白色电路线背景、左上红色圆角章节块、标题下方红蓝分隔线、左侧白色纵向面板及四个蓝色圆环、右侧深蓝标题栏与三张白色金边 KPI 卡及其空心圆图标、底部深蓝金边横幅。

必须彻底移除：页面上的全部中文、字母、数字、符号；中央整棵树的六个节点、五条连线及它们的阴影；KPI 卡中的 6、3、2 和标签；底部遍历文字。移除后用周围一致的背景纹理或面板底色自然补全，不得留下模糊字影、节点残影、三角形、污渍或修复痕迹。

不要新增任何元素，不要改变左右面板、章节块、分隔线、KPI 卡、底部横幅的几何位置，不要裁切，不要增加 logo、水印、页码或说明。输出是一张干净、无任何文字、无中央图形的完整 PPT 框架底板。`;
}

export function buildGordenResidualCleanPrompt() {
  return `这是空白 PPT 框架底板的最后清理步骤。保持输入图片的全部背景纹理、左右空白面板、三个空白 KPI 卡、圆环图标、红蓝分隔线、底部深蓝金边横幅、阴影、比例和坐标完全不变。

只删除输入图片中仍残留的所有字符，尤其必须删除：左上红色块里的“01”、顶部整行中文大标题、标题下方副标题、右侧深蓝栏里的“结构指标”、底部深蓝横幅里的遍历文字。删除后用所在区域自身材质自然填满：红色块恢复为纯净红色，顶部恢复为连续冰白纹理，右侧标题栏恢复为纯净深蓝，底部横幅恢复为纯净深蓝渐变。

输出中必须是零文字、零字母、零数字、零符号。不要新增或移动任何框架元素，不要恢复中央树，不要改变背景，不要添加水印或说明。`;
}

export function buildGenericEditorialCleanPlatePrompt() {
  return `编辑输入图片，制作一张与原图同尺寸、同构图、同专业完成度的无字设计骨架。

完整保留原图的成熟视觉系统：白色背景、主辅色关系、中心主视觉的几何形态、圆形节点、连接线、四周注释区的空间位置、对齐、留白、线宽、图标风格和精细边缘。画面应仍然像已经完成的专业研究报告信息图，而不是线框图、空白模板或低保真草稿。

清除所有可识别字符及其痕迹，包括标题、正文、数字、字母、标点、页码、脚注和水印；字符所在位置用原有底色和连续纹理自然补全。普通文字区域应变成自然留白，不要替换成灰色占位条、乱码、模糊字影或假文字。

不要简化主视觉，不要把图形改成粗糙线框，不要增加卡片、徽章、进度、比例、装饰文字或新的业务图形。保持二维、扁平、克制、清晰、精确。最终图必须零字符，但视觉丰富度、层级和完成度与输入成品一致。`;
}

export function buildPremiumEditorialMasterPrompt({ page }) {
  const claims = (page.claims || []).slice(0, 3).map(claim => claim.text);
  const allowed = [page.title, page.purpose, ...claims, page.coreLogic].filter(Boolean);
  return `根据两张输入图片创作一张高完成度中文技术讲义成品页。

图片 1 是无字构图骨架：继承它的中心关系图位置、六个圆形节点、连接线、四周充足留白和注释区分布。图片 2 是视觉完成度参考：继承它的严谨网格、现代中文研究报告气质、字体层级、细线、统一图标和克制配色。不要复制图片 2 的研究主题或原文字。

页面主题：用节点、边、路径三个概念解释关系结构。中心关系图是唯一主视觉，占据主体约一半；三个概念解释分别围绕中心图分布，连接到对应视觉对象。整体采用白色大留白、深松绿色与灰蓝色，少量暖红只作微小强调；二维扁平、精密、安静，像专业设计师在 Figma 或 Illustrator 中完成的出版级教材信息图。拒绝纸张纹理、粗重阴影、发光、3D 和网页组件感。

文字层级：标题最大，副标题次之，三个术语为中号粗体，解释为短句，底部结论为单行收束。中文必须清晰端正，使用现代无衬线黑体。

页面只渲染以下 ${allowed.length} 条文字，每条只出现一次：
${allowed.map((text, index) => `${index + 1}. 「${text}」`).join('\n')}

所有剩余位置只保留图形与留白，不生成附加段落、角标、统计数字、注释编号或设计元信息。构图完整，元素不贴边，不裁切。输出 2560×1440 的完整横向页面。`;
}

export function buildPremiumTriadEditPrompt({ page }) {
  const claims = (page.claims || []).slice(0, 3).map(claim => {
    const [term, ...rest] = claim.text.split('：');
    return { term, description: rest.join('：') || claim.text };
  });
  return `把输入图片编辑成一张关于数据结构的高端中文技术讲义页。输入图片是成熟设计母版，保持其白色大留白、深绿与浅绿配色、顶部大标题、三段横向箭头、三枚统一线性图标、严格网格和学术研究报告气质。不要重新设计布局，不要改变三个内容区的数量。

将页面文字完整替换为以下内容：
主标题：「${page.title}」
标题下导语：「${page.purpose}」
左侧箭头标题：「${claims[0]?.term || ''}」
左侧说明：「${claims[0]?.description || ''}」
中间箭头标题：「${claims[1]?.term || ''}」
中间说明：「${claims[1]?.description || ''}」
右侧箭头标题：「${claims[2]?.term || ''}」
右侧说明：「${claims[2]?.description || ''}」
底部单行结论：「${page.coreLogic || ''}」

标题使用清晰有力的现代中文黑体；三项术语字号一致，说明各为一句短句。图标分别改成抽象节点、连接关系、连续路径的统一双色线性图标。页面只出现上面列出的文字，每条一次；其余区域维持干净留白。保持二维、扁平、精确、克制，像专业设计师完成的出版级研究报告页面。`;
}

export function buildPremiumTriadPolishPrompt({ page }) {
  return `精修输入图片，使其达到专业出版级中文技术讲义的视觉质量。输入图的标题、副标题、三段箭头结构、全部文字、坐标、留白和阅读顺序都是正确的，必须保持；不要重新排版，不要增加或删除文字。

只执行以下视觉修正：
1. 删除画面上方中央、三段箭头上方的浅绿色残缺图标和任何淡影，恢复连续纯净白色背景。
2. 提高整体对比度与清晰度：标题保持纯黑，副标题与说明文字使用清楚的中深灰，深绿色箭头更稳重，浅绿色箭头保持可读但不要发白。
3. 将三枚概念图标精修成同一套清晰、完整、等线宽的双色矢量图标；分别表达节点、连接关系、连续路径，边缘锐利，不缺笔、不重影。
4. 保持现代研究报告气质：二维、扁平、严格网格、留白充足，无纸纹、无噪点、无厚重投影。

页面可见文字必须仍然只有：「${page.title}」「${page.purpose}」「节点」「一个可识别的数据对象。」「边」「两个节点之间的关系。」「路径」「一组首尾相接的边。」「${page.coreLogic}」。每条只出现一次，逐字不变。`;
}

export function buildPremiumFourLayerSummaryPrompt({ page }) {
  return `以输入图片作为唯一设计母版，生成数据结构课程的四层总结页。输入图已经具有正确且高完成度的背景、四层主体框架、左侧纵向轨道、右侧四项轨道、底部结论栏和全部空白图标位；必须保留这些区域的数量、坐标、比例、材质、描边、阴影、红蓝金配色和精细边缘，不要把它简化成平面线框，也不要重新设计页面。

顶部标题：「${page.title}」
标题下导语：「${page.purpose}」

四层主体从下到上依次填写：
第 1 层：「关系」；四个小模块只放统一线性图标，分别表示节点、边、路径、连通。
第 2 层：「约束」；四个小模块只放统一线性图标，分别表示根、父子、无环、连通。
第 3 层：「操作」；四个小模块只放统一线性图标，分别表示遍历、搜索、插入、更新。
第 4 层：「复杂度」；四个小模块只放统一线性图标，分别表示时间、空间、规模、权衡。

左侧纵向轨道放四枚同风格线性图标，不放说明文字。右侧四项轨道从上到下只写：「01 关系」「02 约束」「03 操作」「04 复杂度」，每项搭配一个清晰双色图标，不放第二行或小字。底部深蓝栏只写：「${page.coreLogic}」

页面只允许出现上述标题、导语、四个层名、右侧四项和底部结论；所有小模块只放图标，不生成英文字母、段落或数据。保持输入图顶级科技发布会信息图的复杂度与完成度，中文清晰端正，图标风格统一，四周完整不裁切。`;
}

export function buildPremiumFourLayerRepairPrompt({ page }) {
  return `精确修复输入图片 1。输入图片 1 的整体设计已经合格：顶部标题区、四层主体框架、左侧轨道、右侧四卡、蓝金底部横幅、背景、电路线、描边、阴影、配色和全部坐标必须保持不变。输入图片 2 是空白框架，仅用于核对原始几何和右侧红蓝金深蓝配色，不重新生成版式。

只修正以下内容：
1. 左上红色章节块中写清晰白字「20」。
2. 四层从下到上必须依次为「关系」「约束」「操作」「复杂度」。当前中间两层的标题和内容需要归位。
3. 每层四个白色小模块只保留一枚清晰的双色线性图标，彻底删除图标下方及图标旁边的全部小字、伪文字、标点和标签。关系层图标表示节点、边、路径、连通；约束层表示根、父子、无环、连通；操作层表示遍历、搜索、插入、更新；复杂度层表示时间、空间、规模、权衡。
4. 左侧纵向轨道只保留四枚清晰线性图标，不出现文字。
5. 右侧四张卡从上到下严格为：「01 关系」「02 约束」「03 操作」「04 复杂度」。恢复母版的分色：第一张红色、第二张科技蓝、第三张金色、第四张深藏青；每张只保留编号、两字标题和一枚图标，不出现小字。
6. 底部文字保持为「${page.coreLogic}」，顶部标题「${page.title}」与导语「${page.purpose}」逐字不变。

除以上明确修改外，不移动、不裁切、不简化任何元素，不改变整体亮度和对比度，不增加新文字。`;
}

export function buildGordenEditorialPolishPrompt() {
  return `把输入图片 1 精装修为一张现代、克制、二维的 16:9 中文科技咨询 PPT 成品页。输入图片 1 是不可更改的精确母版：所有文字、坐标、分区、节点数量、节点标签与五条连线必须保持。输入图片 2 只用于参考成熟的信息密度、网格、对齐与出版级完成度，禁止复制其业务内容。

视觉方向：顶级咨询公司技术白皮书 + 国际科技公司研究报告。采用冰白与极浅蓝背景、深藏青正文、科技蓝结构、信号红章节号，金色只允许作为极细强调线。使用清晰的二维矢量几何、1–2px 精密描边、极轻的层次阴影、充足留白、严格基线和对齐。中央树是最大视觉锚点，六个节点大小统一，连线清楚无交叉。左右信息轨必须精炼而非卡片堆叠。

硬性禁止：3D、浮雕、玻璃、金属镀金、发光按钮、厚重投影、木纹、纸纹、拉丝纹、水彩、噪点、拟物图标、仪表盘、网页 UI、圆角卡片拼贴、廉价渐变、素材网站感。禁止新增任何文字、英文、logo、水印或页码。中文必须逐字清晰；树结构严格且仅为 A→B、A→C、B→D、B→E、C→F；右侧严格三项 6 节点、3 层、2 最大度。

最终效果应比普通 AI 生图更像专业设计师在 Figma/Illustrator 中完成的可出版信息图：扁平、精准、克制、现代，细节丰富但没有视觉噪声。输出完整 2560×1440 页面，不裁切任何元素。`;
}

export function buildGordenEditorialRepairPrompt() {
  return `以输入图片 1 作为唯一需要编辑的 PPT 页面，严格保持它的冰白二维科技风格、顶部标题区、左右栏宽度、深蓝与科技蓝配色、扁平圆形节点、细线、轻阴影和底部横幅不变。输入图片 2 只用于核对正确结构与区域数量，不得改变图片 1 的视觉语言。

只做以下四项修正：
1. 中央树第三层必须且只能有 D、E、F 三个节点。把最左下角错误的 A 改为 D；保留中间 E；保留 C 下方的一个 F；彻底删除最右侧多余的第二个 F 及其连线。
2. 中央连线严格且仅为 A→B、A→C、B→D、B→E、C→F。不得增加箭头、横向虚线或其它连线。
3. 右侧必须且只能有三张 KPI 卡：第一张“6 节点”，第二张“3 层”，第三张“2 最大度”。删除错误的“3 节点”卡；三张卡等高、等距填满原右栏。
4. 保持标题、副标题、左侧四项文字、结构指标标题和底部“先序遍历：A → B → D → E → C → F”逐字不变。

禁止重新设计页面，禁止增加任何节点、卡片、图标、文字、logo、水印或装饰线；禁止 3D、浮雕、金属、厚重阴影和材质噪声。输出完整 2560×1440 页面。`;
}

function imageExtension(contentType, url = '') {
  if (/image\/webp/i.test(contentType) || /\.webp(?:$|\?)/i.test(url)) return 'webp';
  if (/image\/jpe?g/i.test(contentType) || /\.jpe?g(?:$|\?)/i.test(url)) return 'jpg';
  return 'png';
}

async function responseJson(response, label) {
  const text = await response.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = null;
  }
  if (!response.ok) {
    const detail = body?.error?.message || body?.detail || text || response.statusText;
    throw new Error(`${label}失败 (${response.status}): ${String(detail).slice(0, 500)}`);
  }
  if (!body) throw new Error(`${label}返回的不是 JSON`);
  return body;
}

export async function preflightReferenceProvider({ config, cwd, fetchImpl = proxyAwareFetch }) {
  if (config?.mode !== 'openrouter-image' || config.preflight === false) {
    return { status: 'skipped', mode: config?.mode || 'local', reason: 'provider-does-not-require-active-preflight' };
  }
  const started = performance.now();
  const apiKey = await providerSecret(config, cwd);
  const baseUrl = String(config.baseUrl || 'https://openrouter.ai/api/v1').replace(/\/+$/, '');
  const model = config.model || MODEL_POLICY.referenceImage.model;
  const request = {
    model,
    prompt: 'Provider availability preflight. Generate a plain warm-white 16:9 background with no text, no objects, and no marks.',
    n: 1,
    aspect_ratio: config.aspectRatio || '16:9',
    quality: config.preflightQuality || 'low',
    background: config.background || 'opaque',
    stream: false,
  };
  const response = await fetchImpl(`${baseUrl}/images`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(request),
    signal: AbortSignal.timeout(Number(config.preflightTimeoutMs || 120_000)),
  });
  const body = await responseJson(response, `${model} 前置探针`);
  const image = body?.data?.[0];
  if (!image?.b64_json && !image?.url) throw new Error(`${model} 前置探针响应缺少图像`);
  return {
    status: 'pass',
    provider: 'OpenRouter',
    model,
    aspectRatio: request.aspect_ratio,
    quality: request.quality,
    durationMs: Math.round(performance.now() - started),
    usage: body.usage || null,
    responseMediaType: image.media_type || null,
    responseBytesApprox: image.b64_json ? Math.floor(image.b64_json.length * 0.75) : null,
    proxy: proxyDescriptor(`${baseUrl}/images`),
  };
}

export async function parateraReferenceProvider({ page, pagePlan, deckPlan, design, ledger = [], config, cwd, fetchImpl = proxyAwareFetch }) {
  const totalStarted = performance.now();
  const apiKey = await providerSecret(config, cwd);
  const isOpenRouter = config.mode === 'openrouter-image';
  const baseUrl = String(config.baseUrl || (isOpenRouter ? MODEL_POLICY.referenceImage.baseUrl : process.env.PARATERA_BASE_URL || MODEL_POLICY.transparentFallback.baseUrl))
    .replace(/\/+$/, '');
  const model = config.model || (isOpenRouter ? MODEL_POLICY.referenceImage.model : MODEL_POLICY.transparentFallback.model);
  const size = config.size || (isOpenRouter ? null : '2560x1600');
  const globalReferences = Array.isArray(config.styleReferences)
    ? config.styleReferences
    : config.styleReference
      ? [config.styleReference]
      : [];
  const pageReferences = Array.isArray(config.pageStyleReferences?.[page.id])
    ? config.pageStyleReferences[page.id]
    : [];
  const configuredReferences = [...globalReferences, ...pageReferences].map((reference, index) => {
    if (typeof reference === 'string') {
      return {
        file: reference,
        role: config.referenceRoles?.[index]?.role || 'style-reference',
        instruction: config.referenceRoles?.[index]?.instruction || '只学习视觉语言、完成度与构图方法，不复制文字和业务内容。',
      };
    }
    if (!reference || typeof reference !== 'object' || !reference.file) {
      throw new Error(`reference 配置 ${index + 1} 缺少 file`);
    }
    return {
      file: reference.file,
      role: reference.role || 'style-reference',
      instruction: reference.instruction || '只学习视觉语言、完成度与构图方法，不复制文字和业务内容。',
    };
  });
  const styleReferences = await Promise.all(configuredReferences.map(async reference => {
    const file = path.resolve(cwd, reference.file);
    const source = await readFile(file);
    const extension = path.extname(file).toLowerCase();
    const mime = extension === '.jpg' || extension === '.jpeg'
      ? 'image/jpeg'
      : extension === '.webp'
        ? 'image/webp'
        : 'image/png';
    return {
      file,
      role: reference.role,
      instruction: reference.instruction,
      data: `data:${mime};base64,${source.toString('base64')}`,
      sha256: sha256Text(source.toString('base64')),
    };
  }));
  const brief = config.pageBriefs?.[page.id] || {};
  const plannedPrompt = pagePlan && deckPlan
    ? compilePlannedImagePrompt({
        page,
        pagePlan,
        deckPlan,
        design,
        ledger,
        referenceRoles: styleReferences.map(reference => ({
          role: reference.role,
          instruction: reference.instruction,
        })),
      })
    : null;
  const artDirectedPrompt = config.promptProfile === 'art-directed-v2' && pagePlan && deckPlan
    ? compileArtDirectedSlidePrompt({
        page,
        pagePlan,
        deckPlan,
        design,
        referenceRoles: styleReferences.map(reference => ({
          role: reference.role,
          instruction: reference.instruction,
        })),
      })
    : null;
  const seedreamNativePrompt = config.promptProfile === 'seedream-native-v3' && pagePlan && deckPlan
    ? compileSeedreamNativeSlidePrompt({ page, pagePlan, deckPlan })
    : null;
  const seedreamCopyIsolatedPrompt = config.promptProfile === 'seedream-native-v4-copy-isolated' && pagePlan && deckPlan
    ? compileSeedreamCopyIsolatedPrompt({ page, pagePlan, deckPlan })
    : null;
  const researchGroundedPrompt = config.promptProfile === 'research-grounded-v1' && pagePlan && deckPlan
    ? compileResearchGroundedSlidePrompt({ page, pagePlan, deckPlan })
    : null;
  const prompt = config.promptProfile === 'research-grounded-v1' && researchGroundedPrompt
    ? researchGroundedPrompt
    : config.promptProfile === 'seedream-native-v3' && seedreamNativePrompt
    ? seedreamNativePrompt
    : config.promptProfile === 'seedream-native-v4-copy-isolated' && seedreamCopyIsolatedPrompt
    ? seedreamCopyIsolatedPrompt
    : config.promptProfile === 'art-directed-v2' && artDirectedPrompt
    ? artDirectedPrompt
    : !config.promptProfile && plannedPrompt
    ? plannedPrompt
    : config.promptProfile === 'gorden-dense'
    ? buildGordenDensePrompt({ page, design, brief, hasStyleReference: styleReferences.length > 0 })
    : config.promptProfile === 'gorden-repair'
      ? buildGordenRepairPrompt({ page, brief })
      : config.promptProfile === 'gorden-dual-reference'
        ? buildGordenDualReferencePrompt({ page, brief })
        : config.promptProfile === 'gorden-guide-polish'
          ? buildGordenGuidePolishPrompt()
          : config.promptProfile === 'gorden-clean-plate'
            ? buildGordenCleanPlatePrompt()
            : config.promptProfile === 'gorden-generic-clean-plate'
              ? buildGenericEditorialCleanPlatePrompt()
              : config.promptProfile === 'premium-editorial-master'
                ? buildPremiumEditorialMasterPrompt({ page })
                : config.promptProfile === 'premium-triad-edit'
                  ? buildPremiumTriadEditPrompt({ page })
                  : config.promptProfile === 'premium-triad-polish'
                    ? buildPremiumTriadPolishPrompt({ page })
                    : config.promptProfile === 'premium-four-layer-summary'
                      ? buildPremiumFourLayerSummaryPrompt({ page })
                      : config.promptProfile === 'premium-four-layer-repair'
                        ? buildPremiumFourLayerRepairPrompt({ page })
            : config.promptProfile === 'gorden-residual-clean'
              ? buildGordenResidualCleanPrompt()
              : config.promptProfile === 'gorden-editorial-polish'
                ? buildGordenEditorialPolishPrompt()
                : config.promptProfile === 'gorden-editorial-repair'
                  ? buildGordenEditorialRepairPrompt()
      : buildSeedreamReferencePrompt({ page, design, ledger });
  const timeoutMs = Number(config.timeoutMs || 180_000);
  const request = isOpenRouter
    ? {
        model,
        prompt,
        n: 1,
        aspect_ratio: config.aspectRatio || '16:9',
        quality: config.quality || 'high',
        background: config.background || 'opaque',
        stream: false,
      }
    : {
        model,
        prompt,
        size,
        response_format: 'url',
        watermark: config.watermark === true,
        sequential_image_generation: 'disabled',
        stream: false,
      };
  if (styleReferences.length) {
    if (isOpenRouter) {
      request.input_references = styleReferences.map(reference => ({
        type: 'image_url',
        image_url: { url: reference.data },
      }));
    } else {
      request.image = styleReferences.map(reference => reference.data);
    }
  }
  if (!isOpenRouter && Number.isFinite(config.seed)) request.seed = Number(config.seed);
  if (!isOpenRouter && Number.isFinite(config.guidanceScale)) request.guidance_scale = Number(config.guidanceScale);
  const generationStarted = performance.now();
  const response = await fetchImpl(`${baseUrl}${isOpenRouter ? '/images' : '/images/generations'}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(request),
    signal: AbortSignal.timeout(timeoutMs),
  });
  const body = await responseJson(response, `${model} 生成`);
  const generationDurationMs = Math.round(performance.now() - generationStarted);
  const image = body?.data?.[0];
  if (!image) throw new Error(`${model} 响应缺少 data[0]`);

  let binary;
  let extension = 'png';
  let contentType = 'image/png';
  let downloadDurationMs = 0;
  if (image.b64_json) {
    binary = Buffer.from(image.b64_json, 'base64');
    contentType = image.media_type || contentType;
    extension = imageExtension(contentType);
  } else if (image.url) {
    const downloadStarted = performance.now();
    const imageResponse = await fetchImpl(image.url, { signal: AbortSignal.timeout(timeoutMs) });
    if (!imageResponse.ok) throw new Error(`下载生成图失败 (${imageResponse.status})`);
    contentType = imageResponse.headers.get('content-type') || contentType;
    extension = imageExtension(contentType, image.url);
    binary = Buffer.from(await imageResponse.arrayBuffer());
    downloadDurationMs = Math.round(performance.now() - downloadStarted);
  } else {
    throw new Error(`${model} 响应既没有 url 也没有 b64_json`);
  }
  if (binary.length < 1024) throw new Error(`${model} 返回的图像数据异常（${binary.length} bytes）`);

  const composition = {
    source: isOpenRouter ? 'openrouter-image' : 'paratera-seedream',
    model,
    size: size || image.size || `${request.aspect_ratio || 'auto'}:${request.quality || 'auto'}`,
    emphasis: page.graph ? 'network' : page.code ? 'code' : page.series ? 'data' : 'editorial',
    signature: `${isOpenRouter ? 'openrouter-image' : 'seedream'}:${page.id}:${sha256Text(prompt).slice(0, 10)}`,
  };
  return {
    extension,
    binary,
    composition,
    metadata: {
      provider: isOpenRouter ? 'OpenRouter' : 'Paratera',
      model,
      requestedSize: size,
      requestedAspectRatio: request.aspect_ratio || null,
      requestedQuality: request.quality || null,
      requestedBackground: request.background || null,
      contentType,
      bytes: binary.length,
      prompt,
      promptSha256: sha256Text(prompt),
      promptProfile: config.promptProfile || (plannedPrompt ? 'planned-v1' : 'composition-only'),
      timings: {
        generationDurationMs,
        downloadDurationMs,
        totalDurationMs: Math.round(performance.now() - totalStarted),
      },
      styleReferences: styleReferences.map(reference => ({
        file: path.basename(reference.file),
        role: reference.role,
        sha256: reference.sha256,
      })),
      responseSize: image.size || null,
      usage: body.usage || null,
      proxy: proxyDescriptor(`${baseUrl}${isOpenRouter ? '/images' : '/images/generations'}`),
    },
  };
}

export async function staticImageReferenceProvider({ config, cwd }) {
  if (!config.file) throw new Error('static-image provider 需要 file');
  const file = path.resolve(cwd, config.file);
  const binary = await readFile(file);
  const extension = path.extname(file).slice(1).toLowerCase() || 'png';
  return {
    extension: extension === 'jpeg' ? 'jpg' : extension,
    binary,
    composition: {
      source: 'static-image',
      signature: `static:${path.basename(file)}:${sha256Text(binary.toString('base64')).slice(0, 10)}`,
    },
    metadata: {
      provider: 'static-image',
      sourceFile: path.basename(file),
      bytes: binary.length,
      sha256: sha256Text(binary.toString('base64')),
    },
  };
}

function splitMarkdown(markdown) {
  const sections = [];
  let current = { title: '', lines: [] };
  for (const line of markdown.split(/\r?\n/)) {
    const match = line.match(/^#{1,3}\s+(.+)$/);
    if (match) {
      if (current.title || current.lines.some(item => item.trim())) sections.push(current);
      current = { title: match[1].trim(), lines: [] };
    } else {
      current.lines.push(line);
    }
  }
  if (current.title || current.lines.some(item => item.trim())) sections.push(current);
  return sections;
}

function claimsFromLines(lines, sourceId) {
  return lines
    .map(line => line.replace(/^\s*[-*+]\s+/, '').trim())
    .filter(line => line && !line.startsWith('```'))
    .slice(0, 8)
    .map(text => ({ text, sourceIds: [sourceId] }));
}

export async function localContentProvider({ project, projectDir, sources }) {
  if (Array.isArray(project.pages) && project.pages.length) {
    return {
      contentPack: {
        version: '2.0',
        title: project.title,
        audience: project.audience || '',
        language: project.language || 'zh-CN',
        sources,
        pages: project.pages,
      },
    };
  }

  const pages = [];
  for (const source of sources) {
    const markdown = await readFile(path.resolve(projectDir, source.path), 'utf8');
    for (const [index, section] of splitMarkdown(markdown).entries()) {
      const claims = claimsFromLines(section.lines, source.id);
      if (!section.title && !claims.length) continue;
      pages.push({
        id: `page-${String(pages.length + 1).padStart(3, '0')}`,
        title: section.title || `${project.title} · ${index + 1}`,
        purpose: claims[0]?.text || `解释 ${section.title || project.title}`,
        claims,
        coreLogic: claims.map(claim => claim.text).join('；'),
      });
    }
  }
  if (!pages.length) {
    pages.push({
      id: 'page-001',
      title: project.title,
      purpose: `建立对${project.title}的整体理解`,
      claims: [],
      coreLogic: project.title,
    });
  }
  return {
    contentPack: {
      version: '2.0',
      title: project.title,
      audience: project.audience || '',
      language: project.language || 'zh-CN',
      sources,
      pages,
    },
  };
}

function abstractComposition(page) {
  const seed = Number.parseInt(sha256Text(page.id).slice(0, 8), 16);
  const axis = seed % 2 ? 'horizontal' : 'vertical';
  const emphasis = page.graph ? 'network' : page.code ? 'code' : page.series ? 'data' : 'editorial';
  return {
    axis,
    emphasis,
    density: Math.min(5, Math.max(1, (page.claims?.length || 0) + (page.graph?.nodes?.length || 0))),
    signature: `${axis}:${emphasis}:${seed % 7}`,
  };
}

export async function localReferenceProvider({ page, design }) {
  const { width, height, safeInset } = design.canvas;
  const composition = abstractComposition(page);
  const primary = design.colors.primary;
  const accent = design.colors.accent;
  const boxes = composition.axis === 'horizontal'
    ? [
        [safeInset, 220, width * 0.43, 500],
        [width * 0.53, 220, width * 0.41, 225],
        [width * 0.53, 465, width * 0.41, 255],
      ]
    : [
        [safeInset, 210, width - safeInset * 2, 180],
        [safeInset, 415, width - safeInset * 2, 305],
      ];
  const boxSvg = boxes.map(([x, y, w, h], index) => `
    <rect x="${Math.round(x)}" y="${y}" width="${Math.round(w)}" height="${h}" rx="22"
      fill="${index ? '#131D2A' : '#172638'}" stroke="${index ? accent : primary}" stroke-opacity=".55"/>
    <rect x="${Math.round(x + 24)}" y="${y + 28}" width="${Math.round(w * 0.42)}" height="14" rx="7"
      fill="${index ? accent : primary}" fill-opacity=".75"/>
  `).join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect width="${width}" height="${height}" fill="#08101A"/>
  <circle cx="${width - 120}" cy="90" r="180" fill="${primary}" fill-opacity=".05"/>
  <text x="${safeInset}" y="92" fill="#8FA3BA" font-family="system-ui" font-size="24">COMPOSITION DRAFT · ${escapeHtml(composition.emphasis)}</text>
  <rect x="${safeInset}" y="126" width="${Math.round(width * 0.54)}" height="32" rx="16" fill="#DCE7F5" fill-opacity=".85"/>
  <rect x="${safeInset}" y="170" width="${Math.round(width * 0.34)}" height="16" rx="8" fill="#607089"/>
  ${boxSvg}
  <text x="${safeInset}" y="${height - 36}" fill="#607089" font-family="system-ui" font-size="18">仅定义构图，不参与验收</text>
</svg>`;
  return { extension: 'svg', content: svg, composition };
}

function graphLayout(graph, width = 1080, height = 470) {
  const nodes = graph.nodes;
  const incoming = new Map(nodes.map(node => [node.id, 0]));
  const outgoing = new Map(nodes.map(node => [node.id, []]));
  for (const edge of graph.edges) {
    incoming.set(edge.to, (incoming.get(edge.to) || 0) + 1);
    outgoing.get(edge.from)?.push(edge.to);
  }
  const roots = nodes.filter(node => incoming.get(node.id) === 0).map(node => node.id);
  const queue = roots.length ? roots.map(id => [id, 0]) : [[nodes[0]?.id, 0]];
  const level = new Map();
  while (queue.length) {
    const [id, depth] = queue.shift();
    if (level.has(id) && level.get(id) >= depth) continue;
    level.set(id, depth);
    for (const child of outgoing.get(id) || []) queue.push([child, depth + 1]);
  }
  for (const node of nodes) if (!level.has(node.id)) level.set(node.id, 0);
  const maxLevel = Math.max(0, ...level.values());
  const grouped = Array.from({ length: maxLevel + 1 }, () => []);
  for (const node of nodes) grouped[level.get(node.id)].push(node);
  const positions = new Map();
  grouped.forEach((items, depth) => {
    items.forEach((node, index) => {
      positions.set(node.id, {
        x: ((index + 1) * width) / (items.length + 1),
        y: 60 + (depth * (height - 120)) / Math.max(1, maxLevel),
      });
    });
  });
  return positions;
}

function renderGraph(page, prefix) {
  const positions = graphLayout(page.graph);
  const edges = page.graph.edges.map(edge => {
    const from = positions.get(edge.from);
    const to = positions.get(edge.to);
    return `<line x1="${from.x}" y1="${from.y + 32}" x2="${to.x}" y2="${to.y - 32}" class="graph-edge"/>`;
  }).join('');
  const nodes = page.graph.nodes.map(node => {
    const point = positions.get(node.id);
    return `<g transform="translate(${point.x - 92} ${point.y - 30})">
      <rect width="184" height="60" rx="16" class="graph-node"/>
      <text x="92" y="37" text-anchor="middle">${escapeHtml(node.label)}</text>
    </g>`;
  }).join('');
  return `<div class="graph-wrap"><svg viewBox="0 0 1080 470" role="img" aria-label="${escapeHtml(page.title)}">
    <defs><marker id="${prefix}-arrow" markerWidth="9" markerHeight="9" refX="8" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8Z"/></marker></defs>
    ${edges}${nodes}
  </svg></div>`;
}

function renderClaims(page) {
  const claims = (page.claims || []).slice(0, 6);
  if (!claims.length) return `<div class="hero-logic">${escapeHtml(page.coreLogic || page.purpose)}</div>`;
  return `<div class="claim-grid">${claims.map((claim, index) => `
    <article class="claim"><span>${String(index + 1).padStart(2, '0')}</span><p>${escapeHtml(claim.text)}</p></article>
  `).join('')}</div>`;
}

function renderSeries(page) {
  return `<div class="series">${page.series.map(item => `
    <article><strong>${escapeHtml(item.value)}</strong><span>${escapeHtml(item.label)}</span></article>
  `).join('')}</div>`;
}

function renderCode(page) {
  return `<div class="code-frame"><span>${escapeHtml(page.code.language)}</span><pre><code>${escapeHtml(page.code.source)}</code></pre></div>`;
}

export async function localPageProvider({ page, design, attempt = 0 }) {
  const id = page.id;
  const prefix = `[data-page-id="${id}"]`;
  const claimsPage = attempt > 0 && page.claims?.length > 4
    ? { ...page, claims: page.claims.slice(0, 4) }
    : page;
  const body = page.graph
    ? renderGraph(page, id.replace(/[^a-z0-9_-]/gi, '-'))
    : page.code
      ? renderCode(page)
      : page.series
        ? renderSeries(page)
        : renderClaims(claimsPage);
  const html = `<section data-page-id="${escapeHtml(id)}" aria-label="${escapeHtml(page.title)}">
  <style>
    ${prefix} { --primary:${design.colors.primary}; --secondary:${design.colors.secondary}; --accent:${design.colors.accent};
      box-sizing:border-box; width:1440px; height:900px; padding:58px 64px 48px; overflow:hidden;
      background:radial-gradient(circle at 90% 5%,color-mix(in srgb,var(--primary) 12%,transparent),transparent 420px),#08101A;
      color:#DCE7F5; font-family:Inter,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif; text-align:left; }
    ${prefix} * { box-sizing:border-box; }
    ${prefix} .page-kicker { color:var(--primary); font:700 17px/1.2 ui-monospace,monospace; letter-spacing:.12em; text-transform:uppercase; }
    ${prefix} h2 { margin:16px 0 12px; color:#F6F9FD; font-size:48px; line-height:1.12; letter-spacing:-.035em; }
    ${prefix} .purpose { margin:0; max-width:1020px; color:#8FA3BA; font-size:22px; line-height:1.55; }
    ${prefix} .content { height:610px; margin-top:32px; }
    ${prefix} .claim-grid { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:18px; align-content:center; height:100%; }
    ${prefix} .claim { min-height:126px; display:grid; grid-template-columns:48px 1fr; gap:16px; align-items:start;
      padding:22px; border:1px solid #26364C; border-radius:18px; background:rgba(18,29,43,.88); }
    ${prefix} .claim span { color:var(--accent); font:700 17px/1.3 ui-monospace,monospace; }
    ${prefix} .claim p { margin:0; color:#DCE7F5; font-size:22px; line-height:1.55; }
    ${prefix} .hero-logic { display:grid; place-items:center; height:100%; padding:70px; border:1px solid #26364C;
      border-radius:24px; background:#111C29; color:#F6F9FD; font-size:38px; line-height:1.45; text-align:center; }
    ${prefix} .graph-wrap { display:grid; place-items:center; height:100%; border:1px solid #26364C; border-radius:22px; background:#0E1723; }
    ${prefix} .graph-wrap svg { width:100%; height:100%; overflow:visible; }
    ${prefix} .graph-edge { stroke:#607089; stroke-width:3; marker-end:url(#${id.replace(/[^a-z0-9_-]/gi, '-')}-arrow); }
    ${prefix} .graph-wrap marker path { fill:#607089; }
    ${prefix} .graph-node { fill:#172638; stroke:var(--primary); stroke-width:2; }
    ${prefix} .graph-wrap text { fill:#F4F8FC; font-size:20px; font-weight:700; }
    ${prefix} .series { display:grid; grid-template-columns:repeat(auto-fit,minmax(180px,1fr)); gap:18px; align-items:stretch; height:100%; }
    ${prefix} .series article { display:flex; flex-direction:column; justify-content:center; align-items:center; gap:14px;
      border:1px solid #26364C; border-radius:22px; background:#111C29; }
    ${prefix} .series strong { color:var(--accent); font-size:54px; line-height:1; }
    ${prefix} .series span { color:#9FB0C4; font-size:21px; }
    ${prefix} .code-frame { height:100%; padding:22px; border:1px solid #26364C; border-radius:20px; background:#0B121C; }
    ${prefix} .code-frame > span { color:var(--primary); font:700 16px/1 ui-monospace,monospace; text-transform:uppercase; }
    ${prefix} pre { height:520px; margin:18px 0 0; overflow:auto; color:#DCE7F5; font:20px/1.55 ui-monospace,monospace; white-space:pre-wrap; }
    ${prefix} aside.notes { display:none; }
  </style>
  <div class="page-kicker">${escapeHtml(page.id)} · ${escapeHtml(page.coreLogic ? 'CORE LOGIC' : 'SEMANTIC PAGE')}</div>
  <h2>${escapeHtml(page.title)}</h2>
  <p class="purpose">${escapeHtml(page.purpose)}</p>
  <div class="content">${body}</div>
  ${page.speakerNotes ? `<aside class="notes">${escapeHtml(page.speakerNotes)}</aside>` : ''}
</section>`;
  return { html, compositionUsed: abstractComposition(page), attempt };
}

function editableText(tag, className, text) {
  return `<${tag} class="${className}" contenteditable="true" spellcheck="false" data-editable="text">${escapeHtml(text)}</${tag}>`;
}

function hybridGraph(page) {
  const positions = graphLayout(page.graph, 1080, 470);
  const edges = page.graph.edges.map(edge => {
    const from = positions.get(edge.from);
    const to = positions.get(edge.to);
    return `<line x1="${from.x}" y1="${from.y + 30}" x2="${to.x}" y2="${to.y - 30}"/>`;
  }).join('');
  const nodes = page.graph.nodes.map(node => {
    const point = positions.get(node.id);
    return `<div class="hybrid-node" data-node-id="${escapeHtml(node.id)}" contenteditable="true" spellcheck="false" data-editable="graph-label" style="left:${point.x - 92}px;top:${point.y - 30}px">${escapeHtml(node.label)}</div>`;
  }).join('');
  return `<div class="hybrid-graph" data-editable="graph">
    <svg viewBox="0 0 1080 470" aria-hidden="true">${edges}</svg>
    ${nodes}
  </div>`;
}

function hybridConcepts(page) {
  return `<div class="concept-layout">${(page.claims || []).slice(0, 3).map((claim, index) => {
    const [term, ...rest] = claim.text.split('：');
    const description = rest.join('：') || claim.text;
    return `<article class="concept concept-${index + 1}">
      ${editableText('strong', 'concept-term', term)}
      ${editableText('p', 'concept-description', description)}
    </article>`;
  }).join('')}</div>`;
}

function hybridCover(page) {
  return `<div class="cover-labels">${(page.claims || []).slice(0, 3).map((claim, index) =>
    editableText('div', `cover-label cover-label-${index + 1}`, claim.text)
  ).join('')}</div>`;
}

export async function hybridReferencePageProvider({ page, design, reference, attempt = 0 }) {
  if (!reference?.file) throw new Error(`${page.id}: hybrid-reference page provider 缺少 reference.file`);
  const { width, height } = design.canvas;
  const prefix = `[data-page-id="${page.id}"]`;
  const specialClass = page.id === 'page-001' ? 'is-cover' : page.id === 'page-003' ? 'is-concepts' : page.graph ? 'is-graph' : 'is-editorial';
  const body = page.id === 'page-001'
    ? hybridCover(page)
    : page.id === 'page-003'
      ? hybridConcepts(page)
      : page.graph
        ? hybridGraph(page)
        : page.code
          ? renderCode(page)
          : page.series
            ? renderSeries(page)
            : renderClaims(page);
  const html = `<section data-page-id="${escapeHtml(page.id)}" class="hybrid-page ${specialClass}" aria-label="${escapeHtml(page.title)}">
  <style>
    ${prefix}{box-sizing:border-box;position:relative;width:${width}px;height:${height}px;overflow:hidden;background:#f7f4ed;color:#102a43;font-family:Inter,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif;text-align:left}
    ${prefix} *{box-sizing:border-box}
    ${prefix} .visual-plate{position:absolute;inset:0;width:100%;height:100%;object-fit:fill;pointer-events:none;user-select:none}
    ${prefix} .semantic-layer{position:absolute;inset:0;z-index:2}
    ${prefix} [contenteditable="true"]{outline:none}
    ${prefix} [contenteditable="true"]:focus{box-shadow:0 0 0 3px rgba(216,30,6,.28);border-radius:6px}
    ${prefix} .title{position:absolute;left:72px;top:48px;right:110px;margin:0;color:#071f3d;font-size:50px;line-height:1.08;font-weight:800;letter-spacing:-.035em}
    ${prefix} .purpose{position:absolute;left:74px;top:116px;right:180px;margin:0;color:#40566d;font-size:22px;line-height:1.45;font-weight:500}
    ${prefix} .takeaway{position:absolute;left:190px;right:190px;bottom:33px;margin:0;color:#fff;font-size:23px;line-height:1.3;font-weight:700;text-align:center}
    ${prefix}.is-cover .title{top:45px;max-width:850px;font-size:56px}
    ${prefix}.is-cover .purpose{top:116px;max-width:910px}
    ${prefix}.is-cover .takeaway{left:210px;right:210px;bottom:34px;color:#102a43;font-size:24px}
    ${prefix} .cover-label{position:absolute;min-width:245px;padding:13px 22px;border:2px solid rgba(20,100,180,.62);border-radius:15px;background:rgba(255,255,255,.88);color:#0b3158;font-size:20px;line-height:1.25;font-weight:750;text-align:center;box-shadow:0 8px 22px rgba(8,37,75,.08)}
    ${prefix} .cover-label-1{left:337px;top:548px}${prefix} .cover-label-2{left:622px;top:520px}${prefix} .cover-label-3{left:930px;top:470px}
    ${prefix}.is-concepts .title{top:44px}.is-concepts .purpose{top:110px}
    ${prefix}.is-concepts .takeaway{bottom:24px;color:#102a43}
    ${prefix} .concept{position:absolute;width:335px;min-height:112px;padding:20px 24px;border-radius:18px;background:rgba(255,255,255,.74)}
    ${prefix} .concept-1{left:100px;top:308px}.concept-2{right:100px;top:308px}.concept-3{left:632px;top:600px;width:340px}
    ${prefix} .concept-term{display:block;color:#0b3158;font-size:25px;line-height:1.2;font-weight:800}
    ${prefix} .concept-description{margin:10px 0 0;color:#40566d;font-size:19px;line-height:1.45;font-weight:500}
    ${prefix}.is-graph .title{top:38px;font-size:45px}.is-graph .purpose{top:96px}
    ${prefix} .hybrid-graph{position:absolute;left:260px;top:225px;width:1080px;height:470px}
    ${prefix} .hybrid-graph svg{position:absolute;inset:0;width:1080px;height:470px;overflow:visible}
    ${prefix} .hybrid-graph line{stroke:#58718a;stroke-width:6;stroke-linecap:round}
    ${prefix} .hybrid-node{position:absolute;display:grid;place-items:center;width:184px;height:60px;border:3px solid #1464b4;border-radius:18px;background:linear-gradient(135deg,#092b52,#1464b4);color:#fff;font-size:22px;font-weight:800;box-shadow:0 10px 20px rgba(8,37,75,.12)}
    ${prefix}.is-graph .takeaway{bottom:29px}
    ${prefix} aside.notes{display:none}
  </style>
  <img class="visual-plate" src="${escapeHtml(reference.file)}" alt="" draggable="false">
  <div class="semantic-layer">
    ${editableText('h2', 'title', page.title)}
    ${editableText('p', 'purpose', page.purpose)}
    ${body}
    ${editableText('p', 'takeaway', page.coreLogic || page.purpose)}
  </div>
  ${page.speakerNotes ? `<aside class="notes">${escapeHtml(page.speakerNotes)}</aside>` : ''}
</section>`;
  return {
    html,
    compositionUsed: {
      source: 'hybrid-reference',
      backgroundFile: reference.file,
      editableText: true,
      graphTopology: page.graph ? 'local-svg' : 'not-applicable',
    },
    attempt,
  };
}

export async function referenceImagePageProvider({ page, design, reference, attempt = 0 }) {
  if (!reference?.file) throw new Error(`${page.id}: reference-image page provider 缺少 reference.file`);
  const { width, height } = design.canvas;
  const prefix = `[data-page-id="${page.id}"]`;
  const html = `<section data-page-id="${escapeHtml(page.id)}" aria-label="${escapeHtml(page.title)}">
  <style>
    ${prefix} { box-sizing:border-box; position:relative; width:${width}px; height:${height}px; margin:0; padding:0; overflow:hidden; background:#fff; }
    ${prefix} * { box-sizing:border-box; }
    ${prefix} .reference-stage { display:block; width:100%; height:100%; object-fit:fill; margin:0; padding:0; }
    ${prefix} aside.notes { display:none; }
  </style>
  <img class="reference-stage" src="${escapeHtml(reference.file)}" alt="${escapeHtml(page.title)}" draggable="false">
  ${page.speakerNotes ? `<aside class="notes">${escapeHtml(page.speakerNotes)}</aside>` : ''}
</section>`;
  return {
    html,
    compositionUsed: { source: 'reference-image', file: reference.file, fidelityBaseline: true },
    attempt,
  };
}

function layeredText(item, text, extraClass = '', snapshotId = null) {
  const align = item.align || 'left';
  const color = item.color || '#071a35';
  const weight = Number(item.weight || 500);
  const probeBackground = item.probeBackground ? ` data-probe-background="${escapeHtml(item.probeBackground)}"` : '';
  const snapshotClass = snapshotId ? ' snapshot-live' : '';
  const snapshotAttribute = snapshotId ? ` data-snapshot-id="${escapeHtml(snapshotId)}"` : '';
  const editPad = Number(item.editPad || 0);
  const backing = snapshotId && item.editBackground
    ? `<div class="edit-backing" data-snapshot-id="${escapeHtml(snapshotId)}" aria-hidden="true" style="left:${Number(item.x) - editPad}px;top:${Number(item.y) - editPad}px;width:${Number(item.w) + editPad * 2}px;height:${Number(item.h) + editPad * 2}px;background:${escapeHtml(item.editBackground)}"></div>`
    : '';
  return `${backing}<div class="editable-text ${extraClass}${snapshotClass}"${snapshotAttribute} contenteditable="true" spellcheck="false" data-editable="text"${probeBackground}
    style="left:${Number(item.x)}px;top:${Number(item.y)}px;width:${Number(item.w)}px;height:${Number(item.h)}px;font-size:${Number(item.fontSize)}px;font-weight:${weight};color:${escapeHtml(color)};text-align:${escapeHtml(align)}">${escapeHtml(text)}</div>`;
}

export async function layeredReferencePageProvider({ page, design, reference, config, cwd, runDir, attempt = 0 }) {
  if (!runDir) throw new Error(`${page.id}: layered-reference page provider 缺少 runDir`);
  if (!config.layerSpec || !config.baseImage || (!config.nodeSpritesDir && !config.cssNodes)) {
    throw new Error('layered-reference provider 需要 layerSpec、baseImage，以及 nodeSpritesDir 或 cssNodes');
  }
  const spec = JSON.parse(await readFile(path.resolve(cwd, config.layerSpec), 'utf8'));
  const sourceWidth = Number(spec.canvas?.width);
  const sourceHeight = Number(spec.canvas?.height);
  if (!sourceWidth || !sourceHeight) throw new Error('layerSpec.canvas 无效');
  const assetDir = path.join(runDir, 'assets', page.id);
  const nodeDir = path.join(assetDir, 'nodes');
  await mkdir(nodeDir, { recursive: true });
  const baseSource = config.baseImage === '$reference'
    ? path.resolve(runDir, reference.file)
    : path.resolve(cwd, config.baseImage);
  const baseExt = path.extname(baseSource).toLowerCase() || '.jpg';
  const baseTarget = path.join(assetDir, `base${baseExt}`);
  await copyFile(baseSource, baseTarget);
  const toUrl = file => path.relative(runDir, file).replaceAll('\\', '/');
  const prefix = `[data-page-id="${page.id}"]`;
  let fidelityMaskUrl = null;
  if (config.fidelityMask) {
    const maskTarget = path.join(assetDir, 'fidelity-mask.png');
    await copyFile(path.resolve(cwd, config.fidelityMask), maskTarget);
    fidelityMaskUrl = toUrl(maskTarget);
  }
  let snapshotManifest = null;
  let snapshotHtml = '';
  let snapshotCss = '';
  if (config.snapshotManifest) {
    const manifestPath = path.resolve(cwd, config.snapshotManifest);
    snapshotManifest = JSON.parse(await readFile(manifestPath, 'utf8'));
    const maxCoverage = Number(config.maxSnapshotCoverage ?? 0.72);
    if (snapshotManifest.wholePageSnapshot || Number(snapshotManifest.coverageFraction) > maxCoverage) {
      throw new Error(`pixel snapshot 覆盖率 ${snapshotManifest.coverageFraction} 超过上限 ${maxCoverage}，拒绝整页位图伪装`);
    }
    const snapshotTarget = path.join(assetDir, 'snapshots');
    await mkdir(snapshotTarget, { recursive: true });
    const entries = [...(snapshotManifest.text || []), ...(snapshotManifest.graph ? [snapshotManifest.graph] : [])];
    for (const entry of entries) {
      await copyFile(path.resolve(path.dirname(manifestPath), entry.file), path.join(snapshotTarget, entry.file));
    }
    snapshotHtml = entries.map(entry => `<img class="pixel-snapshot ${entry.id === 'graph' ? 'graph-snapshot' : 'text-snapshot'}" data-snapshot-id="${escapeHtml(entry.id)}" src="assets/${escapeHtml(page.id)}/snapshots/${escapeHtml(entry.file)}" alt="" draggable="false" style="left:${Number(entry.x)}px;top:${Number(entry.y)}px;width:${Number(entry.w)}px;height:${Number(entry.h)}px">`).join('');
    snapshotCss = (snapshotManifest.text || []).map(entry => `
    ${prefix} .layer-stage:has([data-snapshot-id="${entry.id}"].snapshot-live:focus) .pixel-snapshot[data-snapshot-id="${entry.id}"],
    ${prefix} .layer-stage:has([data-snapshot-id="${entry.id}"].snapshot-live:focus-within) .pixel-snapshot[data-snapshot-id="${entry.id}"],
    ${prefix} .layer-stage:has([data-snapshot-id="${entry.id}"].snapshot-live[data-edited="true"]) .pixel-snapshot[data-snapshot-id="${entry.id}"]{opacity:0}
    ${prefix} .layer-stage:has([data-snapshot-id="${entry.id}"].snapshot-live:focus) .edit-backing[data-snapshot-id="${entry.id}"],
    ${prefix} .layer-stage:has([data-snapshot-id="${entry.id}"].snapshot-live:focus-within) .edit-backing[data-snapshot-id="${entry.id}"],
    ${prefix} .layer-stage:has([data-snapshot-id="${entry.id}"].snapshot-live[data-edited="true"]) .edit-backing[data-snapshot-id="${entry.id}"]{opacity:1}
    ${prefix} [data-snapshot-id="${entry.id}"].snapshot-live:focus,
    ${prefix} [data-snapshot-id="${entry.id}"].snapshot-live:focus-within,
    ${prefix} [data-snapshot-id="${entry.id}"].snapshot-live[data-edited="true"]{opacity:1}`).join('');
  }

  const graph = spec.graph || { nodes: [], edges: [] };
  if (!config.cssNodes) {
    for (const node of graph.nodes || []) {
      await copyFile(
        path.resolve(cwd, config.nodeSpritesDir, `${node.id}.png`),
        path.join(nodeDir, `${node.id}.png`),
      );
    }
  }

  const baseUrl = toUrl(baseTarget);
  const scaleX = Number(design.canvas.width) / sourceWidth;
  const scaleY = Number(design.canvas.height) / sourceHeight;
  const nodeById = new Map((graph.nodes || []).map(node => [node.id, node]));
  const edges = (graph.edges || []).map(edge => {
    const from = nodeById.get(edge.from);
    const to = nodeById.get(edge.to);
    return `<line class="edge-gold" data-from="${escapeHtml(edge.from)}" data-to="${escapeHtml(edge.to)}" x1="${from.cx}" y1="${from.cy}" x2="${to.cx}" y2="${to.cy}"/><line class="edge-blue" data-from="${escapeHtml(edge.from)}" data-to="${escapeHtml(edge.to)}" x1="${from.cx}" y1="${from.cy}" x2="${to.cx}" y2="${to.cy}"/>`;
  }).join('');
  const nodes = (graph.nodes || []).map(node => {
    const radius = Number(node.radius || graph.radius || 82);
    const pad = Number(node.pad || graph.spritePad || 8);
    const size = (radius + pad) * 2;
    const label = node.label || node.id.toUpperCase();
    const image = config.cssNodes ? '' : `<img src="assets/${escapeHtml(page.id)}/nodes/${escapeHtml(node.id)}.png" alt="" draggable="false">`;
    return `<div class="graph-node${config.cssNodes ? ' css-node' : ''}" data-node-id="${escapeHtml(node.id)}" style="left:${node.cx - size / 2}px;top:${node.cy - size / 2}px;width:${size}px;height:${size}px">
      ${image}
      <span contenteditable="true" spellcheck="false" data-editable="node-label" data-probe-background="#0b56a5">${escapeHtml(label)}</span>
    </div>`;
  }).join('');
  const shapes = (config.renderShapes === false ? [] : (spec.shapes || [])).map(shape => {
    const background = shape.background || 'transparent';
    const border = shape.borderColor ? `${Number(shape.borderWidth || 1)}px solid ${shape.borderColor}` : 'none';
    const radius = shape.type === 'circle' ? '50%' : `${Number(shape.radius || 0)}px`;
    const shadow = shape.shadow ? '0 18px 42px rgba(8,37,75,.12)' : 'none';
    return `<div class="frame-shape ${escapeHtml(shape.className || '')}" aria-hidden="true" style="left:${Number(shape.x)}px;top:${Number(shape.y)}px;width:${Number(shape.w)}px;height:${Number(shape.h)}px;background:${escapeHtml(background)};border:${escapeHtml(border)};border-radius:${radius};box-shadow:${shadow}"></div>`;
  }).join('');
  const text = spec.text || {};
  const concepts = (text.concepts || []).map((item, index) => layeredText(item, item.text, 'concept', snapshotManifest ? `concept-${index}` : null)).join('');
  const kpis = (text.kpis || []).map((item, index) => {
    const semantic = page.series?.[index];
    const value = semantic?.value ?? item.value;
    const label = item.label;
    return `<div class="kpi-copy${snapshotManifest ? ' snapshot-live' : ''}"${snapshotManifest ? ` data-snapshot-id="kpi-${index}"` : ''} style="left:${item.x}px;top:${item.y}px;width:${item.w}px;height:${item.h}px">
      <strong contenteditable="true" spellcheck="false" data-editable="kpi-value" style="color:${escapeHtml(item.valueColor || '#d92512')}">${escapeHtml(value)}</strong>
      <span contenteditable="true" spellcheck="false" data-editable="kpi-label">${escapeHtml(label)}</span>
    </div>`;
  }).join('');
  const html = `<section data-page-id="${escapeHtml(page.id)}" aria-label="${escapeHtml(page.title)}">
  <style>
    ${prefix}{position:relative;box-sizing:border-box;width:${design.canvas.width}px;height:${design.canvas.height}px;margin:0;padding:0;overflow:hidden;background:#fff;font-family:"Microsoft YaHei UI","Microsoft YaHei","Noto Sans SC",sans-serif;text-align:left}
    ${prefix} *{box-sizing:border-box}
    ${prefix} .layer-stage{position:absolute;left:0;top:0;width:${sourceWidth}px;height:${sourceHeight}px;transform:scale(${scaleX},${scaleY});transform-origin:0 0;overflow:hidden}
    ${prefix} .base-layer{position:absolute;inset:0;width:100%;height:100%;object-fit:fill;user-select:none;pointer-events:none}
    ${prefix} .pixel-snapshot{position:absolute;z-index:8;display:block;object-fit:fill;pointer-events:none;user-select:none}
    ${prefix} .graph-snapshot{z-index:6}
    ${prefix} .frame-shape{position:absolute;z-index:2;pointer-events:none}
    ${prefix} .edit-backing{position:absolute;z-index:4;opacity:0;pointer-events:none}
    ${prefix} .graph-layer{position:absolute;z-index:3;inset:0;width:${sourceWidth}px;height:${sourceHeight}px;overflow:visible;pointer-events:none}
    ${prefix} .edge-gold{stroke:${escapeHtml(graph.edgeOutlineColor || '#c29a22')};stroke-width:${Number(graph.edgeOutlineWidth ?? 12)};stroke-linecap:round}
    ${prefix} .edge-blue{stroke:${escapeHtml(graph.edgeColor || '#063a87')};stroke-width:${Number(graph.edgeWidth ?? 8)};stroke-linecap:round}
    ${prefix} .graph-node{position:absolute;z-index:7;filter:none;cursor:default}
    ${prefix} .graph-node.css-node{border-radius:50%;background:radial-gradient(circle at 34% 28%,#1b70c8 0,#0d4d91 46%,#082b55 100%);border:10px solid #169ee3;box-shadow:0 14px 28px rgba(8,37,75,.16);filter:none}
    ${prefix} .graph-node img{position:absolute;inset:0;width:100%;height:100%;object-fit:contain;pointer-events:none;user-select:none}
    ${prefix} .graph-node span{position:absolute;inset:0;display:grid;place-items:center;color:#fff;font-size:56px;font-weight:800;line-height:1;text-shadow:0 1px 2px rgba(0,0,0,.22);outline:none}
    ${prefix} .editable-text{position:absolute;z-index:5;display:flex;align-items:center;line-height:1.08;white-space:nowrap;outline:none;text-shadow:0 1px 1px rgba(255,255,255,.25)}
    ${prefix} .snapshot-live{opacity:0}
    ${prefix} .layer-stage[data-graph-edited="true"] .graph-snapshot{opacity:0}
    ${prefix} .layer-stage[data-graph-edited="true"] .graph-layer,
    ${prefix} .layer-stage[data-graph-edited="true"] .graph-node{opacity:1}
    ${prefix} .graph-node.snapshot-live:has(span:focus),
    ${prefix} .graph-node.snapshot-live[data-edited="true"]{opacity:1}
    ${snapshotCss}
    ${prefix} .chapter{justify-content:center;background:linear-gradient(145deg,#e02812,#c81408);border-radius:26px;box-shadow:0 18px 34px rgba(172,25,12,.22);text-shadow:0 2px 3px rgba(74,8,5,.28)}
    ${prefix} .kpi-header{justify-content:center;background:linear-gradient(145deg,#07345f,#031d38);border-radius:24px 24px 0 0;text-shadow:0 2px 3px rgba(0,0,0,.25)}
    ${prefix} .concept{background:rgba(255,255,255,.96);padding-left:2px}
    ${prefix} .concept::before{content:"";position:absolute;left:-72px;top:10px;width:38px;height:38px;border:7px solid #168dd0;border-radius:50%;background:#fff}
    ${prefix} .kpi-copy{position:absolute;z-index:5;display:flex;flex-direction:column;align-items:flex-start;justify-content:center;outline:none;color:#071a35;background:rgba(255,255,255,.98);border-radius:8px;padding-left:4px}
    ${prefix} .kpi-copy strong{display:block;font-size:64px;line-height:.88;font-weight:800;outline:none}
    ${prefix} .kpi-copy span{display:block;margin-top:4px;font-size:28px;font-weight:800;line-height:1;outline:none;white-space:nowrap}
    ${prefix} .banner{justify-content:center;background:linear-gradient(180deg,#0b3b68,#062b50);border-radius:10px;text-shadow:0 2px 3px rgba(0,0,0,.3)}
    ${prefix} [contenteditable="true"]:focus{box-shadow:0 0 0 3px rgba(20,100,180,.38);border-radius:4px}
    ${prefix} aside.notes{display:none}
  </style>
  <div class="layer-stage" data-source-width="${sourceWidth}" data-source-height="${sourceHeight}">
    <img class="base-layer" src="${escapeHtml(baseUrl)}" alt="" draggable="false">
    ${shapes}
    <svg class="graph-layer${snapshotManifest?.graph ? ' snapshot-live' : ''}" viewBox="0 0 ${sourceWidth} ${sourceHeight}" aria-label="树结构连线">${edges}</svg>
    ${nodes.replaceAll('class="graph-node', `class="graph-node${snapshotManifest?.graph ? ' snapshot-live' : ''}`)}
    ${snapshotHtml}
    ${layeredText(text.chapter, '01', 'chapter', snapshotManifest ? 'chapter' : null)}
    ${layeredText(text.title, page.title, 'title', snapshotManifest ? 'title' : null)}
    ${layeredText(text.subtitle, page.purpose, 'subtitle', snapshotManifest ? 'subtitle' : null)}
    ${concepts}
    ${layeredText(text.kpiHeader, text.kpiHeader.text, 'kpi-header', snapshotManifest ? 'kpi-header' : null)}
    ${kpis}
    ${layeredText(text.banner, text.banner.text, 'banner', snapshotManifest ? 'banner' : null)}
  </div>
  ${page.speakerNotes ? `<aside class="notes">${escapeHtml(page.speakerNotes)}</aside>` : ''}
</section>`;
  return {
    html,
    compositionUsed: {
      source: 'layered-reference',
      file: reference.file,
      baseLayer: baseUrl,
      fidelityMask: fidelityMaskUrl,
      editableTextCount: 3 + (text.concepts?.length || 0) + 1 + (text.kpis?.length || 0) * 2 + 1 + (graph.nodes?.length || 0),
      svgEdgeCount: graph.edges?.length || 0,
      movableNodeCount: graph.nodes?.length || 0,
      snapshotCoverageFraction: snapshotManifest?.coverageFraction || 0,
      snapshotCount: snapshotManifest ? (snapshotManifest.text?.length || 0) + (snapshotManifest.graph ? 1 : 0) : 0,
    },
    attempt,
  };
}

export async function localReviewProvider({ screenshot, page, probe }) {
  return {
    pass: true,
    status: 'pending',
    blocking: false,
    issues: [],
    reason: `未配置 vision provider；已保存单图 ${path.basename(screenshot)}，硬闸状态=${probe.pass ? 'pass' : 'fail'}`,
    pageIntent: page.purpose,
  };
}
