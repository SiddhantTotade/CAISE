from typing import Annotated, Any, Dict

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, StringConstraints
from sqlalchemy.orm import Session

from app.api.deps import get_member_user
from app.api.v1.router import iso_utc
from app.core.database import get_db
from app.models.auth_models import User, UserApiKey
from app.services import keys as key_store

keys_router = APIRouter(prefix="/me/keys", tags=["API keys"])

_MAX_KEY_CHARS = 512


class SaveKeyRequest(BaseModel):
    api_key: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=_MAX_KEY_CHARS)]


def _valid_provider(provider: str) -> str:
    if provider not in key_store.KEY_PROVIDERS:
        raise HTTPException(
            status_code=400,
            detail={"code": "invalid_provider", "message": f"Keys can be stored for: {', '.join(key_store.KEY_PROVIDERS)}"},
        )
    return provider


def _view(row: UserApiKey) -> Dict[str, Any]:
    # The ciphertext and plaintext never leave the server; only a short hint is shown.
    return {"provider": row.provider, "hint": row.hint, "updated_at": iso_utc(row.updated_at)}


@keys_router.get("")
def list_my_keys(user: User = Depends(get_member_user), db: Session = Depends(get_db)) -> Dict[str, Any]:
    rows = key_store.list_keys(db, user.id)
    return {"keys": [_view(rows[p]) for p in key_store.KEY_PROVIDERS if p in rows]}


@keys_router.put("/{provider}")
def save_my_key(
    provider: str, payload: SaveKeyRequest, user: User = Depends(get_member_user), db: Session = Depends(get_db)
) -> Dict[str, Any]:
    return _view(key_store.save_key(db, user.id, _valid_provider(provider), payload.api_key))


@keys_router.delete("/{provider}")
def delete_my_key(
    provider: str, user: User = Depends(get_member_user), db: Session = Depends(get_db)
) -> Dict[str, str]:
    key_store.delete_key(db, user.id, _valid_provider(provider))
    return {"status": "ok"}
