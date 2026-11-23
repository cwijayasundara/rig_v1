.PHONY: test test-fast lint types

test:
	uv run pytest -q

test-fast:
	uv run pytest -q -x

lint:
	uv run ruff check .

types:
	uv run mypy src
