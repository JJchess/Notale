"""Planner topic scrubbing removes style directives, not subject matter."""

from notale.style_studio.scrub import scrub_topic_for_content


def test_inline_directives_are_removed_but_scope_and_audience_survive():
    result = scrub_topic_for_content(
        "为高中生制作 12 页量子力学讲义，采用深色主题，使用蓝紫配色，加入圆角卡片。"
    )
    assert result.changed
    assert "高中生" in result.text
    assert "12 页" in result.text
    assert "量子力学" in result.text
    assert "深色主题" not in result.text
    assert "蓝紫配色" not in result.text
    assert "圆角卡片" not in result.text


def test_explicit_style_sections_are_removed_and_content_sections_survive():
    result = scrub_topic_for_content(
        """# 请求
讲解光合作用，面向初中生。

## 视觉风格
深绿背景
手绘叶片和柔和阴影

## 内容要求
包含光反应与暗反应，并安排一次小测。"""
    )
    assert "深绿背景" not in result.text
    assert "柔和阴影" not in result.text
    assert "## 内容要求" in result.text
    assert "光反应与暗反应" in result.text


def test_labelled_bracket_section_stops_at_the_next_section():
    result = scrub_topic_for_content(
        """【整体风格】
复古报纸，米色底
【主题】
新闻传播史
【页数】
8 页"""
    )
    assert "复古报纸" not in result.text
    assert "新闻传播史" in result.text
    assert "8 页" in result.text


def test_css_hex_and_semantic_background_are_preserved():
    topic = (
        "讲解 CSS 的 background-color:#fff 与 color:#111；"
        "补充工业革命的历史背景。颜色值 #0af 是示例代码。"
    )
    result = scrub_topic_for_content(topic)
    assert result.text == topic
    assert not result.changed


def test_style_key_value_line_is_removed_without_global_hex_scrub():
    result = scrub_topic_for_content(
        "主题：CSS 颜色系统\n配色方案：#101820、#FEE715\n示例：background-color:#fff"
    )
    assert "配色方案" not in result.text
    assert "#101820" not in result.text
    assert "主题：CSS 颜色系统" in result.text
    assert "background-color:#fff" in result.text
