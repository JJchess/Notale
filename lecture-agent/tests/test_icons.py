"""图标附着契约测试：路径可解析、真实中文查询能命中、attach_icons 真的挂上字段。

此前这三条都是零覆盖——_icons_path() 少算一层目录导致 find_icon 恒返回 None，
39 条真实实验记录里 list_icons 恒为 0 都没被发现，直到热力图对着真实数据审计才暴露。
"""

from __future__ import annotations

from lecture_agent.domain.media.icons import _icons_path, attach_icons, find_icon


def test_icons_path_resolves_to_real_file() -> None:
    assert _icons_path().exists()


def test_find_icon_matches_real_chinese_query() -> None:
    icon_id = find_icon("增长趋势明显")
    assert icon_id is not None
    assert icon_id == "trending-up"


def test_find_icon_returns_none_for_empty_query() -> None:
    assert find_icon("") is None


def test_attach_icons_fills_list_items_missing_icon() -> None:
    doc = {
        "scenes": [
            {
                "id": "s1",
                "blocks": [
                    {
                        "type": "list",
                        "items": [
                            {"text": "增长趋势明显，逐年上升"},
                            {"text": "已经手动指定的图标", "icon": "star"},
                        ],
                    }
                ],
            }
        ]
    }
    n = attach_icons(doc)
    items = doc["scenes"][0]["blocks"][0]["items"]
    assert n == 1
    assert items[0]["icon"] == "trending-up"
    assert items[1]["icon"] == "star"  # 已有 icon 的不覆盖
