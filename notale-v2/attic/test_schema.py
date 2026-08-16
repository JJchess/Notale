"""schema 的三条性质,每条都对应一次实测踩过的坑。跑法: python3 core/test_schema.py"""

import sys, pathlib

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))

from pydantic import ValidationError

from core.schema import (
    Chassis, Computation, Deck, Invariant, LibEntry, PagePlan,
    Rejected, Segment, StylePack, Term,
)
from core.views import build_view, plan_view

INV = Invariant(
    query="火箭与轨道",
    minutes=90,
    audience="没学过轨道力学的高中生",
    style=StylePack(
        palette={"ink": "#0B0E14", "paper": "#F2F4F8", "burn": "#FF6A3D"},
        display_font="Space Grotesk",
        body_font="Inter",
        type_scale={"h1": 56, "body": 18, "tick": 13},
        spacing=[4, 8, 16, 32, 64],
        signature="贯穿全片的速度矢量",
    ),
    chassis=Chassis(css_path="assets/base.css", js_path="assets/base.js"),
    libs=[LibEntry(file="assets/lib/three.min.js", globals="THREE",
                   version="r160", use_for="三维场景")],
    env={"node": "v20.20.2"},
)


def term(k, n):
    return Term(key=k, name=n, kind="notation", definition=f"{n} 的定义")


def page(pid, seg, est=(), ass=()):
    return PagePlan(
        id=pid, segment=seg, role="build", takeaway=f"{pid} 的一句话",
        beats=["a"], interaction="拖一下看看",
        rejected=[Rejected(form="静态图", why="看不出因果")],
        computation=Computation(what="两体积分", method="iterative"),
        establishes=list(est), assumes=list(ass),
    )


def deck(pages, terms):
    return Deck(invariant=INV, terms={t.key: t for t in terms},
                segments=[Segment(id="s1", title="t", goal="g", minutes=30, pages=pages)])


def expect_fail(what, fn):
    try:
        fn()
    except (ValidationError, ValueError) as e:
        msg = next((l.strip() for l in str(e).splitlines()
                    if "error" in l.lower() and "pydantic.dev" not in l), str(e))
        print(f"  ok  {what}\n      → {msg[:100]}")
        return
    raise AssertionError(f"应该被拦住却通过了: {what}")


print("1. 规划期静态校验")
expect_fail("assume 了没人 establish 的 term",
            lambda: deck([page("page-01", "s1", ass=["v"])], [term("v", "速度")]))
expect_fail("assume 的 term 由更靠后的页引入",
            lambda: deck([page("page-01", "s1", ass=["v"]),
                          page("page-02", "s1", est=["v"])], [term("v", "速度")]))
expect_fail("同一个 term 被两页重复 establish",
            lambda: deck([page("page-01", "s1", est=["v"]),
                          page("page-02", "s1", est=["v"])], [term("v", "速度")]))
expect_fail("字阶低于字号地板",
            lambda: INV.model_copy(update={"style": INV.style.model_copy(
                update={"type_scale": {"tick": 9}})}).style.model_validate(
                    INV.style.model_dump() | {"type_scale": {"tick": 9}}))
expect_fail("否决理由为空",
            lambda: PagePlan(id="p", segment="s", role="build", takeaway="x",
                             beats=["a"], interaction="y", rejected=[],
                             computation=Computation(what="w", method="none")))

d = deck([page("page-01", "s1", est=["v"]), page("page-02", "s1", ass=["v"])],
         [term("v", "速度")])
print(f"  ok  合法规划通过,页数派生 = {d.total}(schema 里没有任何地方能设定页数)")

print("\n2. prefix 逐字节相同")
a, b = build_view(d, "page-01"), build_view(d, "page-02")
assert a.prefix == b.prefix and a.prefix == plan_view(d).prefix
print(f"  ok  build/build/plan 三者 prefix 完全一致,{len(a.prefix)} 字节")
assert "page-01" not in a.prefix and str(d.total) not in a.prefix.split("分钟")[0]
print("  ok  prefix 里不含页 id;页数不进 prefix,拆页不会作废已发出的 brief")

print("\n3. 隔离是结构性的,不是靠指令")
v2 = build_view(d, "page-02").text()
assert "page-01" not in v2, "别的页 id 泄漏进了 view"
assert d.page("page-01").takeaway not in v2, "别的页的规划泄漏进了 view"
assert "速度 的定义" in v2, "assume 的 term 定义没有被解析进来"
print("  ok  page-02 的 view 里没有 page-01 的任何内容")
print("  ok  它 assume 的 term 定义被原样解析进来了 —— 不需要去读别的页")

print("\n全部通过")
