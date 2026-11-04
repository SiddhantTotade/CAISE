import uuid
from typing import Any, Dict, List
from urllib.parse import urlencode

import httpx
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import JSONResponse, RedirectResponse, Response
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.core.config import settings
from app.core.database import get_db
from app.core.security import ACCESS_TOKEN_COOKIE, create_access_token
from app.models.auth_models import Organization, User

auth_router = APIRouter(prefix="/auth", tags=["Authentication"])

_HTTP_TIMEOUT = 10.0


def _fetch_github_orgs(access_token: str) -> List[Dict[str, Any]]:
    res = httpx.get(
        f"{settings.GITHUB_API_URL}/user/orgs",
        headers={"Authorization": f"Bearer {access_token}", "Accept": "application/vnd.github+json"},
        timeout=_HTTP_TIMEOUT,
    )
    # Missing read:org scope or a transient GitHub error must not block login.
    return res.json() if res.status_code == 200 else []


def _upsert_user(db: Session, profile: Dict[str, Any], github_orgs: List[Dict[str, Any]]) -> User:
    user = db.get(User, str(profile["id"])) or User(id=str(profile["id"]))
    user.username = profile.get("login")
    user.email = profile.get("email")
    user.avatar_url = profile.get("avatar_url")

    orgs = []
    for gh_org in github_orgs:
        org = db.get(Organization, str(gh_org["id"])) or Organization(id=str(gh_org["id"]))
        org.name = gh_org["login"]
        orgs.append(org)
    user.organizations = orgs  # replaces the membership set, so orgs the user left are dropped

    db.add(user)
    db.commit()
    return user


def _set_session_cookie(response: Response, user: User) -> None:
    response.set_cookie(
        key=ACCESS_TOKEN_COOKIE,
        value=create_access_token(data={"sub": user.id, "username": user.username}),
        httponly=True,
        secure=settings.is_production,
        samesite="lax",
        max_age=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
    )


def _user_payload(user: User) -> Dict[str, Any]:
    return {
        "id": user.id,
        "username": user.username,
        "email": user.email,
        "avatar_url": user.avatar_url,
        "organizations": [{"id": o.id, "name": o.name} for o in user.organizations],
        "is_guest": bool(user.is_guest),
    }


@auth_router.get("/github")
def login_github() -> RedirectResponse:
    query = urlencode(
        {
            "client_id": settings.GITHUB_CLIENT_ID,
            "redirect_uri": settings.GITHUB_REDIRECT_URI,
            "scope": settings.GITHUB_OAUTH_SCOPE,
        }
    )
    return RedirectResponse(f"{settings.GITHUB_AUTHORIZE_URL}?{query}")


@auth_router.get("/github/callback")
def github_callback(code: str, db: Session = Depends(get_db)) -> RedirectResponse:
    token_res = httpx.post(
        settings.GITHUB_TOKEN_URL,
        data={
            "client_id": settings.GITHUB_CLIENT_ID,
            "client_secret": settings.GITHUB_CLIENT_SECRET,
            "code": code,
            "redirect_uri": settings.GITHUB_REDIRECT_URI,
        },
        headers={"Accept": "application/json"},
        timeout=_HTTP_TIMEOUT,
    ).json()

    access_token = token_res.get("access_token")
    if not access_token:
        raise HTTPException(status_code=400, detail="Failed to get access token from GitHub")

    profile = httpx.get(
        f"{settings.GITHUB_API_URL}/user",
        headers={"Authorization": f"Bearer {access_token}"},
        timeout=_HTTP_TIMEOUT,
    ).json()

    if profile.get("id") is None:
        raise HTTPException(status_code=400, detail="Failed to fetch GitHub user profile")

    user = _upsert_user(db, profile, _fetch_github_orgs(access_token))
    response = RedirectResponse(
        url=f"{settings.FRONTEND_URL}{settings.FRONTEND_POST_LOGIN_PATH}", status_code=303
    )
    _set_session_cookie(response, user)
    return response


@auth_router.post("/guest")
def start_guest_session(db: Session = Depends(get_db)) -> JSONResponse:
    """Anonymous session: may index public repositories and chat, but has no Settings or stored keys."""
    guest_id = uuid.uuid4().hex
    user = User(id=f"guest-{guest_id}", username=f"guest-{guest_id[:6]}", is_guest=True)
    db.add(user)
    db.commit()
    response = JSONResponse(_user_payload(user))
    _set_session_cookie(response, user)
    return response


@auth_router.get("/me")
def read_current_user(user: User = Depends(get_current_user)) -> Dict[str, Any]:
    return _user_payload(user)


@auth_router.post("/logout")
def logout() -> JSONResponse:
    response = JSONResponse({"status": "ok"})
    # Attributes must match those used by set_cookie, or browsers keep the original cookie.
    response.delete_cookie(
        key=ACCESS_TOKEN_COOKIE,
        path="/",
        httponly=True,
        secure=settings.is_production,
        samesite="lax",
    )
    return response
