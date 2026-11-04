from typing import Optional

import httpx

from app.core.config import settings
from app.services.llm.base import BaseLLMService


class OllamaLLM(BaseLLMService):
    def __init__(self, model_name: Optional[str] = None) -> None:
        self.model_name = model_name or settings.DEFAULT_LOCAL_MODEL
        self.base_url = settings.OLLAMA_BASE_URL

    def generate_response(self, prompt: str, system_prompt: Optional[str] = None) -> str:
        payload: dict = {
            "model": self.model_name,
            "prompt": prompt,
            "stream": False,
            "options": {"temperature": settings.LLM_TEMPERATURE},
        }
        if system_prompt:
            payload["system"] = system_prompt

        response = httpx.post(
            f"{self.base_url}/api/generate", json=payload, timeout=settings.LLM_TIMEOUT_SECONDS
        )
        response.raise_for_status()
        return response.json().get("response", "")


class OpenAICompatibleLLM(BaseLLMService):
    """Chat-completions client shared by OpenAI and DeepSeek (OpenAI-compatible API)."""

    def __init__(self, api_key: str, model_name: str, base_url: Optional[str] = None) -> None:
        if not api_key:
            raise ValueError("API key is not configured for the selected LLM provider")
        from openai import OpenAI

        self.client = OpenAI(api_key=api_key, base_url=base_url, timeout=settings.LLM_TIMEOUT_SECONDS)
        self.model_name = model_name

    def generate_response(self, prompt: str, system_prompt: Optional[str] = None) -> str:
        messages = []
        if system_prompt:
            messages.append({"role": "system", "content": system_prompt})
        messages.append({"role": "user", "content": prompt})

        response = self.client.chat.completions.create(
            model=self.model_name,
            messages=messages,
            temperature=settings.LLM_TEMPERATURE,
            max_tokens=settings.LLM_MAX_TOKENS,
        )
        return response.choices[0].message.content or ""


class AnthropicLLM(BaseLLMService):
    def __init__(self, model_name: Optional[str] = None) -> None:
        if not settings.ANTHROPIC_API_KEY:
            raise ValueError("ANTHROPIC_API_KEY is not configured")
        import anthropic

        self.client = anthropic.Anthropic(
            api_key=settings.ANTHROPIC_API_KEY, timeout=settings.LLM_TIMEOUT_SECONDS
        )
        self.model_name = model_name or settings.ANTHROPIC_MODEL

    def generate_response(self, prompt: str, system_prompt: Optional[str] = None) -> str:
        kwargs: dict = {
            "model": self.model_name,
            "max_tokens": settings.LLM_MAX_TOKENS,
            "temperature": settings.LLM_TEMPERATURE,
            "messages": [{"role": "user", "content": prompt}],
        }
        if system_prompt:
            kwargs["system"] = system_prompt

        response = self.client.messages.create(**kwargs)
        return "".join(block.text for block in response.content if block.type == "text")


SUPPORTED_PROVIDERS = ("ollama", "openai", "anthropic", "deepseek")


def get_llm_service(provider: Optional[str] = None, model_name: Optional[str] = None) -> BaseLLMService:
    """Build the provider selected by `provider` (default: settings.DEFAULT_LLM_PROVIDER).

    `model_name` overrides the provider's configured default model. For Ollama it must be
    one of settings.local_models_list.
    """
    name = (provider or settings.DEFAULT_LLM_PROVIDER).strip().lower()
    if name == "local":
        name = "ollama"

    if name == "ollama":
        if model_name and model_name not in settings.local_models_list:
            raise ValueError(f"Model '{model_name}' is not in AVAILABLE_LOCAL_MODELS")
        return OllamaLLM(model_name)
    if name == "openai":
        return OpenAICompatibleLLM(settings.OPENAI_API_KEY, model_name or settings.OPENAI_MODEL)
    if name == "anthropic":
        return AnthropicLLM(model_name)
    if name == "deepseek":
        return OpenAICompatibleLLM(
            settings.DEEPSEEK_API_KEY,
            model_name or settings.DEEPSEEK_MODEL,
            base_url=settings.DEEPSEEK_BASE_URL,
        )
    raise ValueError(f"Unsupported LLM provider: {name}. Supported: {', '.join(SUPPORTED_PROVIDERS)}")
