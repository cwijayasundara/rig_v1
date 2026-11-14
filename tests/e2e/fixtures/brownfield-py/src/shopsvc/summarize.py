"""A short customer-facing summary of an order, written by the LLM through the adapter."""
from shopsvc.llm_adapter import LlmAdapter
from shopsvc.pricing import total


def summarize(lines: list[tuple[int, int]], adapter: LlmAdapter, code: str | None = None) -> str:
    cents = total(lines, code)
    return adapter.complete(f"Write one friendly sentence confirming an order of {len(lines)} items totalling {cents} cents.")
