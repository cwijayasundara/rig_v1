from types import SimpleNamespace

from shopsvc.llm_adapter import LlmAdapter
from shopsvc.summarize import summarize


class FakeClient:
    """A scripted stand-in for the provider client: no network."""

    def __init__(self):
        self.prompts = []
        self.chat = SimpleNamespace(completions=SimpleNamespace(create=self._create))

    def _create(self, model, messages):
        self.prompts.append(messages[0]["content"])
        return SimpleNamespace(choices=[SimpleNamespace(message=SimpleNamespace(content="Thanks for your order."))])


def test_summary_goes_through_the_adapter():
    fake = FakeClient()
    assert summarize([(500, 2)], LlmAdapter(client=fake)) == "Thanks for your order."
    assert "1000 cents" in fake.prompts[0]
