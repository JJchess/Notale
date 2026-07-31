"""graph 块的图论完整性校验。

graph 是唯一带 edges 的块类型——树/DAG/分支流程此前在 schema 里**根本不可表达**
（flow 只有一条线性链，diagram 只有固定形状，节点对象还是 additionalProperties:false，
连夹带一个 from/to 都做不到），于是模型只能把树硬塞成"叠盘子"。

这里守的是 pydantic 表达不了的**关系**约束：断边、孤立节点、tree 单父单根、环。
校验规则须与 viewer/schema/validate.mjs::checkGraph 保持一致（两边同时改）。
"""

from __future__ import annotations

from typing import Any

from lecture_agent.schema.validate import validate_doc


def _doc(block: dict[str, Any]) -> dict[str, Any]:
    return {
        "schemaVersion": "1.0", "id": "d", "title": "t", "language": "zh-CN", "theme": "slate",
        "scenes": [{"id": "s1", "kind": "content", "headline": "h", "notes": "备注。", "blocks": [block]}],
    }


def _errs(block: dict[str, Any]) -> list[str]:
    return [e for e in validate_doc(_doc(block)).errors if ".blocks[0]" in e]


def _tree(**over: Any) -> dict[str, Any]:
    b = {
        "id": "g", "type": "graph", "graphType": "tree",
        "nodes": [{"id": "r", "title": "根"}, {"id": "a", "title": "左"}, {"id": "b", "title": "右"}],
        "edges": [{"from": "r", "to": "a"}, {"from": "r", "to": "b"}],
    }
    b.update(over)
    return b


def test_valid_tree_passes() -> None:
    assert _errs(_tree()) == []


def test_dangling_edge_rejected() -> None:
    errs = _errs(_tree(edges=[{"from": "r", "to": "a"}, {"from": "r", "to": "NOPE"}]))
    assert any("不存在的节点" in e for e in errs)


def test_orphan_node_rejected() -> None:
    errs = _errs(_tree(edges=[{"from": "r", "to": "a"}]))
    assert any("不连任何边" in e for e in errs), errs


def test_tree_rejects_multiple_parents() -> None:
    errs = _errs(_tree(edges=[{"from": "r", "to": "a"}, {"from": "b", "to": "a"}]))
    assert any("至多一个父" in e for e in errs), errs


def test_tree_rejects_two_roots() -> None:
    b = _tree(
        nodes=[{"id": "r", "title": "根1"}, {"id": "r2", "title": "根2"}, {"id": "a", "title": "子"}],
        edges=[{"from": "r", "to": "a"}, {"from": "r2", "to": "a"}],
    )
    assert any("恰好一个根" in e or "至多一个父" in e for e in _errs(b))


def test_duplicate_node_id_rejected() -> None:
    b = _tree(nodes=[{"id": "r", "title": "A"}, {"id": "r", "title": "B"}, {"id": "a", "title": "C"}])
    assert any("id 重复" in e for e in _errs(b))


def test_self_loop_rejected() -> None:
    assert any("自环" in e for e in _errs(_tree(edges=[{"from": "r", "to": "r"}])))


def test_dag_allows_multiple_parents() -> None:
    b = _tree(graphType="dag", edges=[{"from": "r", "to": "a"}, {"from": "b", "to": "a"}])
    assert _errs(b) == []


def test_dag_rejects_cycle() -> None:
    b = _tree(graphType="dag", edges=[{"from": "r", "to": "a"}, {"from": "a", "to": "b"}, {"from": "b", "to": "r"}])
    assert any("存在环" in e for e in _errs(b))


def test_flowchart_allows_dashed_back_edge() -> None:
    """回边是 flowchart 的正当表达，但必须显式标虚线。"""
    b = _tree(
        graphType="flowchart",
        edges=[{"from": "r", "to": "a"}, {"from": "a", "to": "b"}, {"from": "b", "to": "r", "style": "dashed"}],
    )
    assert _errs(b) == []


def test_flowchart_rejects_solid_back_edge() -> None:
    b = _tree(
        graphType="flowchart",
        edges=[{"from": "r", "to": "a"}, {"from": "a", "to": "b"}, {"from": "b", "to": "r"}],
    )
    assert any("未标虚线的回边" in e for e in _errs(b))


def test_bare_latex_in_node_title_is_caught() -> None:
    """节点标题也走 inlineMd，裸 LaTeX 同样会原样印出。"""
    b = _tree(nodes=[{"id": "r", "title": r"根 \pi[4]"}, {"id": "a", "title": "左"}, {"id": "b", "title": "右"}])
    assert any("裸 LaTeX" in e for e in _errs(b))


def test_graph_is_reachable_by_planner() -> None:
    """graph 必须进规划菜单，否则做了也白做——freeform 就是被 AUTO_EXCLUDE 挡了整整一轮。"""
    from lecture_agent.domain.skills import load_skills, plan_menu

    registry, _ = load_skills()
    assert "graph" in registry
    assert "graph" in {t for _s, _d, types in plan_menu(registry) for t in types}


def test_freeform_no_longer_excluded() -> None:
    """freeform 已从 AUTO_EXCLUDE 移出：它是长尾兜底，不该连被选中的机会都没有。"""
    from lecture_agent.domain.skills import load_skills, plan_menu

    registry, _ = load_skills()
    assert "freeform" in {t for _s, _d, types in plan_menu(registry) for t in types}
