import base64
import hashlib
from functools import lru_cache

from cryptography.fernet import Fernet, InvalidToken

from app.core.config import settings

_HINT_CHARS = 4


@lru_cache(maxsize=1)
def _fernet() -> Fernet:
    if settings.API_KEY_ENCRYPTION_KEY:
        return Fernet(settings.API_KEY_ENCRYPTION_KEY.encode())
    # Domain-separated from the JWT use of SECRET_KEY, so a token can never double as a data key.
    digest = hashlib.sha256(b"caise.user-api-keys\0" + settings.SECRET_KEY.encode()).digest()
    return Fernet(base64.urlsafe_b64encode(digest))


def encrypt(plaintext: str) -> str:
    return _fernet().encrypt(plaintext.encode()).decode()


def decrypt(ciphertext: str) -> str | None:
    """The plaintext, or None when the ciphertext cannot be read (rotated secret / corrupt row)."""
    try:
        return _fernet().decrypt(ciphertext.encode()).decode()
    except InvalidToken:
        return None


def key_hint(api_key: str) -> str:
    return "…" + api_key[-_HINT_CHARS:] if len(api_key) > _HINT_CHARS * 2 else "…"
