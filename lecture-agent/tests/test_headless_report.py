"""HeadlessVerifier 的机读桥必须保留逐页浏览器指标。"""

from lecture_agent.adapters.render.headless import _to_report


def test_to_report_keeps_page_metrics() -> None:
    metric = {
        "i": 2,
        "overflowX": 0,
        "overflowY": 0,
        "dynamicBlank": [],
        "chartMinWidthUse": 0.96,
        "widgetMinHeight": 340,
        "minTextPx": 14,
    }
    report = _to_report(
        {
            "ok": True,
            "docs": [
                {
                    "fails": [],
                    "overflowPages": [],
                    "corruptPages": [],
                    "pageMetrics": [metric],
                }
            ],
            "shots": [],
        }
    )
    assert report.ok
    assert report.page_metrics == [metric]
