"""Current per-page Builder handoff; historical parsers live outside the harness."""

from dataclasses import dataclass


@dataclass
class Brief:
    description: str
    prompt: str

    def as_tool_input(self) -> dict:
        return {
            "description": self.description,
            "prompt": self.prompt,
        }
