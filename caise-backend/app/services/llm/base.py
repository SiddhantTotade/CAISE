from abc import ABC, abstractmethod
from typing import Optional


class BaseLLMService(ABC):
    """Common interface implemented by every LLM provider."""

    @abstractmethod
    def generate_response(self, prompt: str, system_prompt: Optional[str] = None) -> str:
        """Return the model's completion for `prompt`."""
