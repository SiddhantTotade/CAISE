import json
import logging
from typing import AsyncIterator, Dict, List, Optional

import anthropic
import httpx
import openai

from app.core.config import settings
from app.services.llm.catalog import ModelSelection, effective_api_key, is_configured

Messages = List[Dict[str, str]]  # [{"role": "user"|"assistant", "content": str}, ...], oldest first

logger = logging.getLogger(__name__)


class LLMStreamError(Exception):
    """A provider failure already translated into a client-safe code, message and HTTP status.

    Upstream error text is never forwarded: provider messages can echo credentials.
    """

    def __init__(self, code: str, message: str, http_status: int) -> None:
        super().__init__(message)
        self.code = code
        self.message = message
        self.http_status = http_status


def _translate(exc: Exception, provider: str) -> LLMStreamError:
    """Map an SDK / httpx exception to an LLMStreamError."""
    if isinstance(exc, (httpx.TimeoutException, openai.APITimeoutError, anthropic.APITimeoutError)):
        code, status, msg = "provider_timeout", 504, f"{provider} did not respond in time"
    elif isinstance(
        exc,
        (openai.AuthenticationError, openai.PermissionDeniedError,
         anthropic.AuthenticationError, anthropic.PermissionDeniedError),
    ) or (isinstance(exc, httpx.HTTPStatusError) and exc.response.status_code in (401, 403)):
        code, status, msg = "provider_auth_failed", 502, f"{provider} rejected the configured API key"
    elif isinstance(exc, (openai.RateLimitError, anthropic.RateLimitError)) or (
        isinstance(exc, httpx.HTTPStatusError) and exc.response.status_code == 429
    ):
        code, status, msg = "provider_rate_limited", 429, f"{provider} rate limit or quota exceeded"
    elif isinstance(exc, (openai.NotFoundError, anthropic.NotFoundError)) or (
        isinstance(exc, httpx.HTTPStatusError) and exc.response.status_code == 404
    ):
        code, status, msg = "model_not_found", 404, f"The selected model is not available on {provider}"
    elif isinstance(exc, (openai.APIConnectionError, anthropic.APIConnectionError, httpx.TransportError)):
        code, status, msg = "provider_unreachable", 502, f"Could not connect to {provider}"
    else:
        logger.exception("Unexpected %s streaming failure", provider)
        return LLMStreamError("provider_error", f"{provider} returned an error", 502)

    logger.warning("%s stream failed: %s (%s)", provider, code, type(exc).__name__)
    return LLMStreamError(code, msg, status)


async def _stream_ollama(model: str, messages: Messages, system: Optional[str]) -> AsyncIterator[str]:
    payload = {
        "model": model,
        "messages": [{"role": "system", "content": system}, *messages] if system else messages,
        "stream": True,
        "options": {"temperature": settings.LLM_TEMPERATURE, "num_predict": settings.LLM_MAX_TOKENS},
    }
    url = f"{settings.OLLAMA_BASE_URL.rstrip('/')}/api/chat"
    # A float timeout applies per read, so it bounds the gap between chunks, not the whole answer.
    async with httpx.AsyncClient(timeout=settings.LLM_TIMEOUT_SECONDS) as client:
        async with client.stream("POST", url, json=payload) as response:
            if response.is_error:
                await response.aread()
                response.raise_for_status()
            async for line in response.aiter_lines():
                if not line:
                    continue
                data = json.loads(line)
                if "error" in data:  # Ollama reports mid-stream failures as an NDJSON object
                    raise LLMStreamError("provider_error", "ollama returned an error", 502)
                text = data.get("message", {}).get("content", "")
                if text:
                    yield text
                if data.get("done"):
                    return


async def _stream_openai_compatible(
    api_key: str, model: str, messages: Messages, system: Optional[str], base_url: Optional[str] = None
) -> AsyncIterator[str]:
    # max_retries=0: fail within one timeout instead of silently retrying (3x the wait).
    async with openai.AsyncOpenAI(
        api_key=api_key, base_url=base_url, timeout=settings.LLM_TIMEOUT_SECONDS, max_retries=0
    ) as client:
        stream = await client.chat.completions.create(
            model=model,
            messages=[{"role": "system", "content": system}, *messages] if system else messages,
            temperature=settings.LLM_TEMPERATURE,
            max_tokens=settings.LLM_MAX_TOKENS,
            stream=True,
        )
        async for chunk in stream:
            if chunk.choices and chunk.choices[0].delta.content:  # final usage chunks have no choices
                yield chunk.choices[0].delta.content


async def _stream_anthropic(
    api_key: str, model: str, messages: Messages, system: Optional[str]
) -> AsyncIterator[str]:
    extra = {"system": system} if system else {}
    async with anthropic.AsyncAnthropic(
        api_key=api_key, timeout=settings.LLM_TIMEOUT_SECONDS, max_retries=0
    ) as client:
        async with client.messages.stream(
            model=model,
            max_tokens=settings.LLM_MAX_TOKENS,  # no `temperature`: anthropic SDK 2.x rejects it
            messages=messages,
            **extra,
        ) as stream:
            async for text in stream.text_stream:
                yield text


def _backend(
    selection: ModelSelection, messages: Messages, system: Optional[str], api_key: str
) -> AsyncIterator[str]:
    provider, model = selection.provider, selection.model
    if provider == "ollama":
        return _stream_ollama(model, messages, system)
    if provider == "openai":
        return _stream_openai_compatible(api_key, model, messages, system)
    if provider == "deepseek":
        return _stream_openai_compatible(api_key, model, messages, system, base_url=settings.DEEPSEEK_BASE_URL)
    if provider == "anthropic":
        return _stream_anthropic(api_key, model, messages, system)
    raise LLMStreamError("invalid_request", f"Unsupported LLM provider: {provider}", 400)


async def stream_tokens(
    selection: ModelSelection,
    messages: Messages,
    system: Optional[str] = None,
    api_key_override: Optional[str] = None,
) -> AsyncIterator[str]:
    """Yield the model's output text chunk by chunk. Every failure surfaces as LLMStreamError.

    `messages` is the full chat (prior turns, then the new user turn). `api_key_override` replaces the
    server-configured key for cloud providers and is ignored for ollama; it is never logged.
    """
    if not is_configured(selection.provider, api_key_override):
        raise LLMStreamError(
            "provider_not_configured", f"{selection.provider} API key is not configured", 503
        )
    api_key = effective_api_key(selection.provider, api_key_override) or ""
    try:
        async for text in _backend(selection, messages, system, api_key):
            yield text
    except LLMStreamError:
        raise
    except Exception as exc:
        raise _translate(exc, selection.provider) from exc
