import httpx
from app.core.config import settings
from app.services.llm.base import BaseLLMService

class OllamaLLM(BaseLLMService):
    def __init__(self, model_name: str = settings.LOCAL_LLM_MODEL):
        self.model_name = model_name
        self.base_url = settings.OLLAMA_BASE_URL

    def generate_response(self, prompt, system_prompt = None):
        payload = {
            "model": self.model_name,
            "prompt": prompt,
            "stream": False
        }

        if system_prompt:
            payload["system"] = system_prompt

        response = httpx.post(f"{self.base_url}/api/generate", json=payload, timeout=120.0)
        response.raise_for_status()

        return response.json().get("response", "")

class AnthropicLLM(BaseLLMService):
    def __init__(self):
        import anthropic
        self.client = anthropic.Anthropic(api_key=settings.ANTHROPIC_API_KEY)

    def generate_response(self, prompt: str, system_prompt: str = None) -> str:
        messages = [{"role": "user", "content": prompt}]
        kwargs = {
            "model": "claude-3-5-sonnet-20241022",
            "max_tokens": 4096,
            "messages": messages
        }

        if system_prompt:
            kwargs["system"] = system_prompt

        response = self.client.messages.create(**kwargs)

        return response.content[0].text

    def get_llm_service(provider: str = settings.DEFULT_LLM_PROVIDER) -> BaseLLMService:
        provider = provider.lower()

        if provider == "ollama" or provider == "local":
            return OllamaLLM()
        elif provider == "anthropic":
            return AnthropicLLM()
        else:
            raise ValueError(f"Unsupported LLM Provider: {provider}")