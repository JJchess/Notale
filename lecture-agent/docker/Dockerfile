# 钉死运行环境，供 artifact evaluation 干净复现（见 PROJECT_STRUCTURE §7）。
FROM python:3.12-slim

# uv：可复现依赖解析
COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv

WORKDIR /app
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev

COPY . .

# 复现入口：replay 模式，零 API、完全确定
CMD ["uv", "run", "python", "scripts/run_experiment.py", "+experiment=main_result"]
