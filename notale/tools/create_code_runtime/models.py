"""Strict contracts for the create_code_runtime tool."""

from __future__ import annotations

import json

from pydantic import BaseModel, ConfigDict, Field, model_validator


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class RuntimeFixture(StrictModel):
    name: str = Field(min_length=1, max_length=80)
    input_json: str = Field(min_length=1, max_length=3000)
    expected_json: str = Field(min_length=1, max_length=3000)

    @model_validator(mode="after")
    def validate_json_values(self) -> "RuntimeFixture":
        try:
            json.loads(self.input_json)
            json.loads(self.expected_json)
        except json.JSONDecodeError as exc:
            raise ValueError(f"fixture values must be valid JSON strings: {exc}") from exc
        return self

    def runtime_payload(self) -> dict[str, object]:
        return {
            "name": self.name,
            "input": json.loads(self.input_json),
            "expected": json.loads(self.expected_json),
        }


class CodeRuntimeSpec(StrictModel):
    title: str = Field(min_length=1, max_length=120)
    instruction: str = Field(min_length=1, max_length=600)
    starter_code: str = Field(min_length=10, max_length=12000)
    reference_code: str = Field(min_length=10, max_length=12000)
    fixtures: list[RuntimeFixture] = Field(min_length=2, max_length=8)

    @model_validator(mode="after")
    def validate_fixture_names(self) -> "CodeRuntimeSpec":
        names = [item.name.casefold() for item in self.fixtures]
        if len(names) != len(set(names)):
            raise ValueError("runtime fixture names must be unique")
        return self
