"""主题(theme)描述注册表——规划器选主题的「描述即决策面」,对齐 skills.registry 的思路。

**为什么存在**:主题描述曾硬编码成 planning.py 里一整句 f-string,既无独立数据源、又带学科偏向
(如"理工实验/研究公报/密集考据"),还有"别总默认 cobalt-grid/非可量化题材别选 lab"这类方向驱动。
本模块把它换成结构化、纯视觉/情绪、零学科词的注册表,选择权完全交给模型据气质自判(不推默认、不强制求异)。

**描述来源**:字段取自多项目综合的「公约数」(frontend-slides 的 tagline+mood+formality/density/scheme、
presentation-ai 的 mode、slidev 的 tag 体系……都能映射进来)。当前 15 个主题的文案用**各自出处**:
13 个译/凝缩自 refs/frontend-slides/bold-template-pack/selection-index.json,lab/slate 取自 viewer/index.html 的 token。

**入库新主题**(库存后期要从更多项目持续借鉴丰富):① schema/enums.py 的 Theme 加成员;
② viewer/index.html + viewer/schema/enums.mjs 加同名 [data-theme] token;③ 这里加一条 ThemeDesc
(把新来源元数据映射进下列字段、填 source)。tests/test_themes.py 的双向 guard 会挡住任一漏项。
"""

from __future__ import annotations

from dataclasses import dataclass

from ..schema.enums import Theme


@dataclass(frozen=True)
class ThemeDesc:
    """一个主题的纯视觉/情绪画像(零学科词)。字段是跨项目公约数,任何来源都能映射进来。"""

    tagline: str  # 中文视觉 tagline(配色 + 字体 + 气质),译/凝缩自 source
    mood: tuple[str, ...]  # 情绪/调性词
    formality: str  # 正式度:低 / 中 / 中高 / 高
    density: str  # 信息密度:低 / 中 / 高
    scheme: str  # light | dark | mixed
    source: str  # 溯源:如 "frontend-slides:cartesian" / "viewer-css"


# 按 Theme 枚举声明顺序维护(便于与 enums.py 逐条对照)。描述一律纯视觉/情绪、无"适合X学科"字样。
THEME_DESCS: dict[Theme, ThemeDesc] = {
    Theme.CARTESIAN: ThemeDesc(
        "暖中性配色 + 古典 Playfair 衬线;雅致、从容不迫",
        ("安静", "考究", "优雅", "暖简"),
        "高",
        "低",
        "light",
        "frontend-slides:cartesian",
    ),
    Theme.COBALT_GRID: ThemeDesc(
        "电钴蓝衬线 + 方格纸底 + 像素微故障装饰 + 发丝线;考究、现代主义、印刷感",
        ("编辑", "现代主义", "克制", "印刷感"),
        "高",
        "中",
        "light",
        "frontend-slides:cobalt-grid",
    ),
    Theme.LAB: ThemeDesc(
        "暗靛紫舞台 + 青磷光强调 + 等宽数字 + 细网格底;冷峻、精密、荧光科技感",
        ("冷峻", "精密", "荧光科技", "高对比"),
        "中",
        "中",
        "dark",
        "viewer-css",
    ),
    Theme.SLATE: ThemeDesc(
        "冷灰绘图纸 + Newsreader 衬线 + 单一琥珀强调,无底纹;冷静、克制、编辑感",
        ("冷静", "克制", "编辑感"),
        "高",
        "中",
        "light",
        "viewer-css",
    ),
    Theme.SOFT_EDITORIAL: ThemeDesc(
        "暖纸底 + Cormorant Garamond 衬线 + 鼠尾草/腮红/柠檬点缀;文雅、优雅、从容",
        ("文学", "优雅", "安静", "暖古典"),
        "高",
        "低",
        "light",
        "frontend-slides:soft-editorial",
    ),
    Theme.VELLUM: ThemeDesc(
        "深藏青底 + 暖黄 Cormorant 衬线 + 灰蓝绿点缀;沉静、书卷、思辨气",
        ("书卷", "文学", "沉静", "智性"),
        "高",
        "低",
        "dark",
        "frontend-slides:vellum",
    ),
    Theme.GROVE: ThemeDesc(
        "森绿底 + 奶油字 + 古典 Playfair 衬线 + 单一铁锈红;温润、自然、从容",
        ("有机", "考究", "温暖", "自然"),
        "中高",
        "中",
        "mixed",
        "frontend-slides:grove",
    ),
    Theme.MONOCHROME: ThemeDesc(
        "象牙账簿纸 + 全黑字 + Lora 衬线标题/Jost 正文,零彩色;克制、档案、账簿感",
        ("克制", "文学", "档案", "账簿"),
        "高",
        "高",
        "light",
        "frontend-slides:monochrome",
    ),
    Theme.SIGNAL: ThemeDesc(
        "深藏青底 + 骨白纸 + 单一哑金强调;稳重、可信、静默的分量感",
        ("机构感", "可信", "考究", "厚重"),
        "高",
        "高",
        "mixed",
        "frontend-slides:signal",
    ),
    Theme.BROADSIDE: ThemeDesc(
        "暗色编辑底 + 单一烈焰橙 + 中西双语字阵;戏剧、响亮、报头感",
        ("编辑", "戏剧", "响亮", "报头"),
        "中高",
        "中",
        "dark",
        "frontend-slides:broadside",
    ),
    Theme.EMERALD_EDITORIAL: ThemeDesc(
        "翡翠绿 + 藏青 + 纸色,双线报头饰 + 粗 Bodoni 展示衬线;杂志封面感、自信",
        ("编辑", "考究", "自信", "杂志封面"),
        "中高",
        "中",
        "mixed",
        "frontend-slides:emerald-editorial",
    ),
    Theme.EDITORIAL_FOREST: ThemeDesc(
        "森绿 + 灰粉 + 暖奶油 + Source Serif 4;安静、克制、编辑感",
        ("编辑", "安静", "考究", "温暖"),
        "中",
        "中",
        "mixed",
        "frontend-slides:editorial-forest",
    ),
    Theme.BOLD_POSTER: ThemeDesc(
        "编辑海报风 + 巨号 Shrikhand 展示字 + 单一消防红;大胆、响亮、自信",
        ("大胆", "编辑", "响亮", "自信"),
        "中",
        "低",
        "light",
        "frontend-slides:bold-poster",
    ),
    Theme.CORAL: ThemeDesc(
        "近黑底 + 奶油与珊瑚色 + 超大号 Bebas Neue;大胆、温暖、杂志粗体",
        ("大胆", "温暖", "现代", "杂志"),
        "中",
        "中",
        "mixed",
        "frontend-slides:coral",
    ),
    Theme.STUDIO: ThemeDesc(
        "纯黑底 + 电光黄字;高压工作室气场,库里最响",
        ("电感", "大胆", "图形化", "高对比"),
        "中",
        "中",
        "dark",
        "frontend-slides:studio",
    ),
}


def theme_menu() -> list[tuple[str, str]]:
    """按 Theme 枚举顺序产出 (theme值, 一行渲染串),供规划器 prompt 的主题选单。零学科词。

    加一个主题=在 THEME_DESCS 补一条即自动进选单(与 skills.plan_menu 同一"描述即决策面"精神)。
    """
    out: list[tuple[str, str]] = []
    for t in Theme:
        d = THEME_DESCS[t]
        line = f"{d.tagline};{'/'.join(d.mood)};正式度{d.formality}·密度{d.density}·{d.scheme}"
        out.append((t.value, line))
    return out
