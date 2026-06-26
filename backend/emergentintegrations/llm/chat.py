"""Stub for emergentintegrations.llm.chat — real package not installed."""


class UserMessage:
    def __init__(self, text: str) -> None:
        self.text = text


class TextDelta:
    def __init__(self, text: str = "") -> None:
        self.text = text

    def __str__(self) -> str:
        return self.text


class StreamDone:
    pass


class LlmChat:
    def __init__(
        self, api_key: str = "", session_id: str = "", system_message: str = ""
    ) -> None:
        self.api_key = api_key
        self.session_id = session_id
        self.system_message = system_message
        self._model: tuple[str, str] | None = None

    def with_model(self, provider: str, model: str):
        self._model = (provider, model)
        return self

    async def stream_message(self, message: UserMessage):
        yield TextDelta(
            f"[Emergent LLM not available — install emergentintegrations and set EMERGENT_LLM_KEY]"
        )
        yield StreamDone()
