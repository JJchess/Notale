import pytest
from pydantic import ValidationError

from notale.core.models import LecturePlan, PageArtifact


def test_minimal_plan_and_page_roundtrip(plan_data):
    plan = LecturePlan.model_validate(plan_data)
    assert len(plan.pages) == 4
    assert [chapter.pages for chapter in plan.chapters] == [2, 2]
    assert plan.model_dump(mode="json")["pages"][2]["links"][0]["target"] == 1
    page = PageArtifact(html="<section data-notale-page>内容</section>", notes="讲稿")
    assert PageArtifact.model_validate_json(page.model_dump_json()) == page


@pytest.mark.parametrize("field", ["schema_version", "page_id", "time_budget_sec", "design_spec", "status"])
def test_page_rejects_legacy_fields(field):
    with pytest.raises(ValidationError):
        PageArtifact.model_validate({"html": "<section>x</section>", field: 1})


def test_plan_rejects_missing_cross_chapter_link(plan_data):
    plan_data["pages"][2]["links"] = []
    plan_data["pages"][3]["links"] = []
    with pytest.raises(ValidationError, match="earlier chapter"):
        LecturePlan.model_validate(plan_data)
