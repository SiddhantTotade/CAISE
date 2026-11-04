from datetime import datetime, timezone
from typing import Dict, Optional

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core import crypto
from app.models.auth_models import UserApiKey

# Providers whose key a user may store (ollama is local and needs none).
KEY_PROVIDERS = ("openai", "anthropic", "deepseek")


def save_key(db: Session, user_id: str, provider: str, api_key: str) -> UserApiKey:
    row = db.get(UserApiKey, (user_id, provider)) or UserApiKey(user_id=user_id, provider=provider)
    row.ciphertext = crypto.encrypt(api_key)
    row.hint = crypto.key_hint(api_key)
    row.updated_at = datetime.now(timezone.utc)
    db.add(row)
    db.commit()
    return row


def delete_key(db: Session, user_id: str, provider: str) -> None:
    row = db.get(UserApiKey, (user_id, provider))
    if row is not None:
        db.delete(row)
        db.commit()


def list_keys(db: Session, user_id: str) -> Dict[str, UserApiKey]:
    return {r.provider: r for r in db.scalars(select(UserApiKey).where(UserApiKey.user_id == user_id))}


def get_key(db: Session, user_id: str, provider: str) -> Optional[str]:
    """The user's plaintext key for `provider`, or None when absent or unreadable."""
    row = db.get(UserApiKey, (user_id, provider))
    return crypto.decrypt(row.ciphertext) if row else None
