.PHONY: install lint types contract test gen repro all

install:        ## 装依赖（uv）
	uv sync --all-extras

lint:           ## ruff 检查+格式
	uv run ruff check src tests
	uv run ruff format --check src tests

types:          ## mypy 严格类型
	uv run mypy

contract:       ## import-linter 解耦契约（无逆向/跨层/环依赖）
	uv run lint-imports

test:           ## 单测（传 fake adapter，不碰真 LLM/浏览器）
	uv run pytest -q

gen:            ## 生成一份 deck：make gen TOPIC="梯度下降"
	uv run python -m lecture_agent.app.cli generate --topic "$(TOPIC)"

repro:          ## 干净复现：replay 模式跑固定实验，产出全部指标/图
	uv run python scripts/run_experiment.py +experiment=main_result

all: lint types contract test  ## 本地全门禁
