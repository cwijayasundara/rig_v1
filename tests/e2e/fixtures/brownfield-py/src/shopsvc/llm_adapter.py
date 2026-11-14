"""The one place the service talks to the LLM provider (an external dependency)."""
import os

try:  # the provider's client library; absent in tests, which inject a fake
    from openai import OpenAI
except ImportError:  # pragma: no cover
    OpenAI = None


class LlmAdapter:
    def __init__(self, client=None, model: str = "gpt-4o-mini"):
        if client is None:
            if OpenAI is None:
                raise RuntimeError("openai client library is not installed")
            client = OpenAI(api_key=os.environ["OPENAI_API_KEY"])
        self.client = client
        self.model = model

    def complete(self, prompt: str) -> str:
        reply = self.client.chat.completions.create(model=self.model, messages=[{"role": "user", "content": prompt}])
        return reply.choices[0].message.content
