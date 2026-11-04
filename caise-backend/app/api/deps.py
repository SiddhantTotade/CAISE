from typing import Optional

from fastapi import Depends, HTTPException, Request
from jose import JWTError
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import ACCESS_TOKEN_COOKIE, decode_access_token
from app.models.auth_models import User

_BEARER_PREFIX = "bearer "


def _resolve_user(request: Request, db: Session) -> Optional[User]:
    """The caller from the session cookie or an `Authorization: Bearer` header; None when anonymous."""
    token = request.cookies.get(ACCESS_TOKEN_COOKIE)
    if not token:
        header = request.headers.get("Authorization", "")
        if header.lower().startswith(_BEARER_PREFIX):
            token = header[len(_BEARER_PREFIX):].strip()
    if not token:
        return None
    try:
        claims = decode_access_token(token)
    except JWTError:
        return None
    return db.get(User, str(claims.get("sub", "")))


def get_current_user(request: Request, db: Session = Depends(get_db)) -> User:
    """Any signed-in caller, guests included."""
    user = _resolve_user(request, db)
    if user is None:
        raise HTTPException(status_code=401, detail="Not authenticated")
    return user


def get_optional_user(request: Request, db: Session = Depends(get_db)) -> Optional[User]:
    return _resolve_user(request, db)


def get_member_user(user: User = Depends(get_current_user)) -> User:
    """A GitHub-authenticated user; guests are refused."""
    if user.is_guest:
        raise HTTPException(status_code=403, detail={"code": "guest_forbidden", "message": "Sign in with GitHub to use this feature"})
    return user
