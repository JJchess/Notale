"""历史抠图实现，已退出生产媒体链路；仅供追溯。

**为什么这一步归 harness，不归建页 agent。**
同一条规律已经在取图上验过两遍:规格直接点名已存在的文件 → 48 页出图 16 张;
让建页自己搜、挑、下、内联、编归属 → 48 页出图 4 张、归属 8/8 全缺、
同一张图 base64 内联两遍。抠图比取图更容易出坏产物(绿边、抠掉一半、水印残留),
越不该放到 8–12 路并行里各赌一次。**确定的事 harness 做。**

**为什么不用 rembg。** 它要 onnxruntime 加一个 176MB 权重,而这里的输入是
「孤立物体 + 一块平背景」——天体照的底是黑的太空,生成图的底是我们在提示词里
指定的 chroma 色。这种输入用连通域就够,而且结果可复现。

管线,每一步都是量出来的:

    四角中位色当背景色 → 算距离得遮罩 → 填内部空洞 → 取最大连通域
      → despill → 收 1px、羽化 3px → 按 alpha 裁紧

**「取最大连通域」顺手解决了「AI生成」水印。** `make-illustration` 的 SKILL.md 记着
那个角标去不掉、要当画面的一部分处理。实测它落在右下角,是 4–9 像素的几个小连通域
(一张土星图上除主体外有 61 个碎块,最大的才 9 像素),取最大的那块就把它们全扔了。

**despill 不是可选的。** 实测土星在绿底上抠完,边界像素平均色 `[63,191,83]` ——
绿边肉眼可见,环那几道细边尤其脏。压掉超出 `max(R,B)` 的绿之后是 `[109,114,92]`。
代价是它会碰到前景内 20.5% 的像素,所以**主体本身是那个色的时候会掉饱和度** ——
这就是 `despill_frac` 这条闸的来由。
"""

from __future__ import annotations

from pathlib import Path

import cv2
import numpy as np
from PIL import Image

# chroma 底色只用来决定「压哪个通道」。**背景色一律取四角中位数,不用这里的标称值** ——
# 实测要洋红 `#FF00FF` 回来的是 `[245,44,150]`,要绿 `#00FF00` 回来的是 `[29,229,82]`。
# 值 = (溢色通道, 参照通道)。**洋红是两个通道,不是一个** —— 第一版只压 R,
# 于是判据变成 `R - max(G,B) > 8`,任何暖色都命中:金属箔 `(255,215,100)` 直接触发,
# 一台冷调探测器被报成「despill 碰到前景 64%」。这是判据的实现比它声称的语义**宽**
# 的那一种,和常见的窄反着,但同样是没量就写。
KEYS = {"magenta": ((0, 2), (1,)),     # 洋红 = R、B 都高,G 低
        "green":   ((1,), (0, 2))}     # 绿 = G 高

# 阈值两档,都是实测出来的:天体照的底是纯黑(四角 [0,0,0]、标准差≈0),28 就够;
# chroma 底有布纹和光照,标准差 3–7,要 60。
THRESH = {"photo": 28, "chroma": 60}

# 抠完之后不透明像素占外接框的比例。两头各挡一种失败:
#   上限 —— 这张根本没有可分离的背景。`mars-global.jpg` 实测 94.7%,它是满框图不是天体照。
#   下限 —— 主体没了。
# 中间放得很宽,因为「稀」是合法的:带环的土星实测 55.2%,正圆是 78.5%,木星 76.8%。
OPAQUE_RANGE = (0.15, 0.92)
DESPILL_CEIL = 0.35

# 外接框边界上不透明像素的占比。**这一条是补上来的,因为上面那条 `opaque_frac`
# 声称挡「不像孤立物体」,实际只挡了「没有可分离的背景」** —— 判据的实现比它
# 声称的语义窄,这一轮里已经是第九次。
# 漏掉的样子是实的:`earth-apollo17.jpg`(Apollo 17 的 Tracy's Rock 月面风景)
# 抠完 87% 不透明、1 个连通域,大摇大摆过了 —— 它只是把顶上的黑天空削掉了,
# 剩下整片风景。
# 分得很干净:真正的孤立物体(comet-67p / jupiter-juno / 原行星盘 / voyager)
# **边界不透明全是 0%**;风景和满框图是 54–63%;整页底图 16–19%。
BORDER_CEIL = 0.25


def cut(src: Path, key: str | None = None) -> tuple[Image.Image | None, dict]:
    """抠 `src`。`key=None` 表示照片(背景是黑的太空);否则是生成图的 chroma 底色名。

    返回 `(RGBA 或 None, 账)`。**不合格就返回 None,由调用方决定怎么记** ——
    这一层不落盘,也不 raise:fail-visible 的前提是那条账能被打出来。
    """
    im = Image.open(src).convert("RGB")
    a = np.asarray(im).astype(np.int16)
    h, w = a.shape[:2]
    c = max(24, min(h, w) // 24)
    corners = np.concatenate([a[:c, :c].reshape(-1, 3), a[:c, -c:].reshape(-1, 3),
                              a[-c:, :c].reshape(-1, 3), a[-c:, -c:].reshape(-1, 3)])
    bg = np.median(corners, 0)

    # **四角必须彼此一致,否则「背景色」这个概念就不成立。**
    # 这一条是量出来的,而且报错信息本来是错的:让模型生成一台探测器、要求纯黑底,
    # 它无视 `no floor` 加了个受光地面 —— 上两角 `[0,0,0]`、下两角 `[112,111,116]`,
    # 四角中位数落在 56,两边都不挨着,于是遮罩盖满全图,闸报的是「不透明 100%」。
    # 那个说法把「没有统一背景」说成了「没有可分离的背景」,查起来会走错方向。
    quads = [a[:c, :c].reshape(-1, 3).mean(0), a[:c, -c:].reshape(-1, 3).mean(0),
             a[-c:, :c].reshape(-1, 3).mean(0), a[-c:, -c:].reshape(-1, 3).mean(0)]
    spread = float(max(np.sqrt(((q1 - q2) ** 2).sum())
                       for q1 in quads for q2 in quads))
    if spread > 60:
        return None, dict(ok=False, n_components=0, corner_spread=round(spread, 1),
                          why=f"四角彼此差 {spread:.0f}（上限 60）—— 这张没有统一的背景色，"
                              f"抠不出来")

    thresh = THRESH["photo" if key is None else "chroma"]
    mask = (np.sqrt(((a - bg) ** 2).sum(2)) > thresh).astype(np.uint8)
    mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, np.ones((9, 9), np.uint8))

    # 填内部空洞。**必须有** —— 天体上的暗区(木星的极区、月面的阴影)和背景同色,
    # 不填的话会在主体上抠出洞来。从 (0,0) 泛洪,填不到的就是内部。
    ff = mask.copy()
    cv2.floodFill(ff, np.zeros((h + 2, w + 2), np.uint8), (0, 0), 1)
    mask = ((mask == 1) | (ff == 0)).astype(np.uint8)

    n, lab, st, _ = cv2.connectedComponentsWithStats(mask, 8)
    if n < 2:
        return None, dict(ok=False, why="没有前景:整张和四角同色", n_components=0)
    big = int(np.argmax(st[1:, cv2.CC_STAT_AREA])) + 1
    keep = (lab == big).astype(np.uint8)
    keep = cv2.morphologyEx(keep, cv2.MORPH_CLOSE, np.ones((15, 15), np.uint8))
    keep = cv2.erode(keep, np.ones((3, 3), np.uint8), 1)      # 收 1px,切掉最脏的一圈

    rgb = a.copy()
    despill_frac = 0.0
    if key is not None:
        chs, others = KEYS[key]
        cap = rgb[:, :, others[0]]
        for o in others[1:]:
            cap = np.maximum(cap, rgb[:, :, o])
        # 溢色的判据是**所有溢色通道都**高出参照通道 —— 用 min 而不是任意一个,
        # 否则单通道偏高的正常色(橙 `(200,120,80)`、金 `(255,215,100)`)会被误判。
        lo = rgb[:, :, chs[0]]
        for c in chs[1:]:
            lo = np.minimum(lo, rgb[:, :, c])
        spill = (lo - cap) > 8
        for c in chs:
            rgb[:, :, c] = np.where(spill, cap, rgb[:, :, c])
        fg = keep > 0
        despill_frac = float((spill & fg).sum() / max(fg.sum(), 1))

    alpha = cv2.GaussianBlur(keep * 255, (3, 3), 0).astype(np.uint8)
    ys, xs = np.where(alpha > 8)
    if not len(ys):
        return None, dict(ok=False, why="收边之后主体没了", n_components=n - 1)
    out = np.dstack([rgb.clip(0, 255).astype(np.uint8), alpha])
    crop = out[ys.min():ys.max() + 1, xs.min():xs.max() + 1]
    opaque = float((crop[:, :, 3] > 128).mean())

    acc = dict(ok=True, why="", size=(crop.shape[1], crop.shape[0]),
               opaque_frac=round(opaque, 3), despill_frac=round(despill_frac, 3),
               n_components=n - 1)
    if not OPAQUE_RANGE[0] <= opaque <= OPAQUE_RANGE[1]:
        acc.update(ok=False, why=f"不透明占外框 {opaque:.0%},要求 "
                                 f"{OPAQUE_RANGE[0]:.0%}–{OPAQUE_RANGE[1]:.0%}"
                                 f"（太高=这张没有可分离的背景,太低=主体没了）")
        return None, acc
    border = np.concatenate([crop[0, :, 3], crop[-1, :, 3],
                             crop[:, 0, 3], crop[:, -1, 3]]) > 128
    acc["border_frac"] = round(float(border.mean()), 3)
    if border.mean() > BORDER_CEIL:
        acc.update(ok=False, why=f"外接框边界上 {border.mean():.0%} 不透明,超过 "
                                 f"{BORDER_CEIL:.0%} —— 这是一张跑出画外的风景/满框图,"
                                 f"不是孤立物体")
        return None, acc
    if despill_frac > DESPILL_CEIL:
        acc.update(ok=False, why=f"despill 碰到前景 {despill_frac:.0%},超过 "
                                 f"{DESPILL_CEIL:.0%} —— 主体和抠像底色同色,换 key")
        return None, acc
    return Image.fromarray(crop, "RGBA"), acc
