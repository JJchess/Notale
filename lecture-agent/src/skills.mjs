/* 技能加载器 —— "加一个文件夹 = 加一个技能"。
   扫 skills/<name>/：SKILL.md（frontmatter: name/description）+ 可选 contracts.json（type→契约模板）。
   带 contracts.json 的技能 = block 家族生成器；其余（generate-lecture / lecture-doc-schema / evolve-schema）是元/文档技能。
   产出 registry: blockType → { skill, contract }，供编排器按 block 类型路由到对应家族契约。 */
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
export const SKILLS_DIR = resolve(here, '..', 'skills');

/* 逃生舱/单例类型：注册但不进"自动规划菜单"（agent 不会主动排它们；显式请求另说）。 */
export const AUTO_EXCLUDE = new Set(['runnable', 'freeform', 'embed']);

/* 全局创作硬规则（所有 block 生成共享；违反会被 validate.mjs 打回）。 */
export const AUTHORING_RULES = `硬规则(违反会被校验/打回)：
- 正文克制，一页一个观点；lead 是一句陈述，不是"本页将展示…"这类引导语；不写"让我们""值得注意的是"。
- **具体优先，别空泛**：给真实的例子/数据/名称/引文，而非抽象概括——讲文学就引真实作品与词句、讲算法就给具体输入→输出和一个边界/错误例子、讲科学就带数值与单位。每个要点尽量落到一个可感的具体物；宁可少讲一点也要讲实。
- **难点要有一个具象锚点**：全课最难的那个概念/机制，别停在抽象描述——就地补一个到位的具象锚点帮学生跨过门槛（一步步走一个最小例子 / 一个反例或错误示范 / 一个贴切类比 / 一张 flow 或 sim 图示）。一个足矣、别堆砌（呼应"一页一个观点"）。
- 文本字段只用 inline-md(**b**/*em*/\`code\`/$latex$)，禁原始 HTML 标签。
- 公式一律 LaTeX，不用 Unicode 上下标。formula 块的 latex 填纯源码，**不要** $ / $$ 包裹（正文里的行内公式才用 $…$）。
- 绝不写死颜色/字体(主题 token 负责视觉)。
- 中文排版：中文句全角标点；汉字与拉丁/数字间空格(如 2026 年、AI 产品)；中文标签不做 uppercase。
- 多个并列要点用 agenda(逐行等高)，别把两个不等高的块并排；compare 只用于左右天然对称内容。
- sim 优先 dynamics1d/searchCompare；表达式只能用白名单标识符+数学函数。`;

function parseFrontmatter(md) {
  const m = md.match(/^---\n([\s\S]*?)\n---/);
  const fm = {};
  if (m) for (const line of m[1].split('\n')) {
    const kv = line.match(/^(\w[\w-]*):\s*(.*)$/);
    if (kv) fm[kv[1]] = kv[2].trim().replace(/^["']|["']$/g, '');
  }
  return fm;
}

/** 加载所有技能。返回 { skills:[{name,dir,description,types}], registry:Map<type,{skill,contract}>, autoTypes:[] } */
export function loadSkills(dir = SKILLS_DIR) {
  const skills = [];
  const registry = new Map();
  for (const name of readdirSync(dir)) {
    const sdir = join(dir, name);
    if (!statSync(sdir).isDirectory()) continue;
    const skPath = join(sdir, 'SKILL.md');
    if (!existsSync(skPath)) continue;
    const md = readFileSync(skPath, 'utf8');
    const fm = parseFrontmatter(md);
    const entry = { name: fm.name || name, dir: sdir, description: fm.description || '', body: md, types: [] };
    const cPath = join(sdir, 'contracts.json');
    if (existsSync(cPath)) {
      let contracts;
      try { contracts = JSON.parse(readFileSync(cPath, 'utf8')); }
      catch (e) { throw new Error(`技能 ${name} 的 contracts.json 解析失败: ${e.message}`); }
      for (const [type, contract] of Object.entries(contracts)) {
        if (registry.has(type)) throw new Error(`block 类型 "${type}" 被多个技能声明（${registry.get(type).skill} 与 ${entry.name}）——一个类型只能归一个家族`);
        registry.set(type, { skill: entry.name, dir: sdir, contract, description: entry.description });
        entry.types.push(type);
      }
    }
    skills.push(entry);
  }
  const autoTypes = [...registry.keys()].filter(t => !AUTO_EXCLUDE.has(t));
  return { skills, registry, autoTypes };
}
