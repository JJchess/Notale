import os
from pathlib import Path

from notale.cli.main import load_cli_env


def test_load_cli_env_prefers_process_then_local_then_default(
    tmp_path: Path, monkeypatch
) -> None:
    (tmp_path / ".env").write_text("FROM_DEFAULT=default\nSHARED=default\n", encoding="utf-8")
    (tmp_path / ".env.local").write_text("FROM_LOCAL=local\nSHARED=local\n", encoding="utf-8")
    monkeypatch.setenv("SHARED", "process")
    monkeypatch.delenv("FROM_DEFAULT", raising=False)
    monkeypatch.delenv("FROM_LOCAL", raising=False)

    load_cli_env(tmp_path)

    assert os.environ["SHARED"] == "process"
    assert os.environ["FROM_LOCAL"] == "local"
    assert os.environ["FROM_DEFAULT"] == "default"


def test_load_cli_env_local_overrides_default(tmp_path: Path, monkeypatch) -> None:
    (tmp_path / ".env").write_text("VALUE=default\n", encoding="utf-8")
    (tmp_path / ".env.local").write_text("VALUE=local\n", encoding="utf-8")
    monkeypatch.delenv("VALUE", raising=False)

    load_cli_env(tmp_path)

    assert os.environ["VALUE"] == "local"
