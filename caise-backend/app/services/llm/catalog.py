from dataclasses import dataclass
from typing import AbstractSet, Any, Callable, Dict, List, Optional

from app.core.config import settings
from app.services.llm.provider import SUPPORTED_PROVIDERS


@dataclass(frozen=True)
class ModelSelection:
    provider: str
    model: str


@dataclass(frozen=True)
class _ProviderSpec:
    default_model: Callable[[], str]
    listed_models: Callable[[], List[str]]
    api_key: Optional[Callable[[], str]]  # None -> no credential needed (local provider)


def _csv(value: str) -> List[str]:
    return [item.strip() for item in value.split(",") if item.strip()]


# Callables, so values are read from `settings` at call time rather than frozen at import.
_SPECS: Dict[str, _ProviderSpec] = {
    "ollama": _ProviderSpec(
        lambda: settings.DEFAULT_LOCAL_MODEL, lambda: settings.local_models_list, None
    ),
    "openai": _ProviderSpec(
        lambda: settings.OPENAI_MODEL,
        lambda: _csv(settings.AVAILABLE_OPENAI_MODELS),
        lambda: settings.OPENAI_API_KEY,
    ),
    "anthropic": _ProviderSpec(
        lambda: settings.ANTHROPIC_MODEL,
        lambda: _csv(settings.AVAILABLE_ANTHROPIC_MODELS),
        lambda: settings.ANTHROPIC_API_KEY,
    ),
    "deepseek": _ProviderSpec(
        lambda: settings.DEEPSEEK_MODEL,
        lambda: _csv(settings.AVAILABLE_DEEPSEEK_MODELS),
        lambda: settings.DEEPSEEK_API_KEY,
    ),
}


def normalize_provider(provider: Optional[str]) -> str:
    name = (provider or settings.DEFAULT_LLM_PROVIDER).strip().lower()
    if name == "local":
        name = "ollama"
    if name not in _SPECS:
        raise ValueError(f"Unsupported LLM provider: {name}. Supported: {', '.join(SUPPORTED_PROVIDERS)}")
    return name


def provider_models(provider: str) -> List[str]:
    """Selectable models for `provider`: its default model first, then the configured list, de-duplicated."""
    spec = _SPECS[provider]
    return list(dict.fromkeys([spec.default_model(), *spec.listed_models()]))


def api_key_for(provider: str) -> Optional[str]:
    getter = _SPECS[provider].api_key
    return getter() if getter else None


def effective_api_key(provider: str, override: Optional[str] = None) -> Optional[str]:
    """The key to call `provider` with: a non-empty per-request `override` wins for cloud providers."""
    if _SPECS[provider].api_key is None:
        return None
    return (override or "").strip() or api_key_for(provider)


def is_configured(provider: str, api_key_override: Optional[str] = None) -> bool:
    return _SPECS[provider].api_key is None or bool(effective_api_key(provider, api_key_override))


def resolve_selection(provider: Optional[str], model: Optional[str]) -> ModelSelection:
    """Validate a client's provider/model choice. Raises ValueError for anything not offered by `list_catalog`."""
    name = normalize_provider(provider)
    chosen = (model or "").strip() or _SPECS[name].default_model()
    if chosen not in provider_models(name):
        raise ValueError(f"Model '{chosen}' is not available for provider '{name}'")
    return ModelSelection(name, chosen)


def list_catalog(user_key_providers: AbstractSet[str] = frozenset()) -> Dict[str, Any]:
    """`configured` is true for local providers and for cloud providers with a server key or a key saved by the caller."""
    return {
        "default_provider": normalize_provider(None),
        "providers": [
            {
                "id": name,
                "type": "local" if _SPECS[name].api_key is None else "cloud",
                "configured": is_configured(name) or name in user_key_providers,
                "has_user_key": name in user_key_providers,
                "default_model": _SPECS[name].default_model(),
                "models": provider_models(name),
            }
            for name in SUPPORTED_PROVIDERS
        ],
    }
