from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import RedirectResponse

import httpx

from app.core.config import settings
from app.core.security import create_access_token

auth_router = APIRouter(prefix="/auth", tags=["Authentication"])

GITHUB_CLIENT_ID = settings.GITHUB_CLIENT_ID
GITHUB_CLIENT_SECRET = settings.GITHUB_CLIENT_SECRET

@auth_router.get("/github")
def login_github():
    return RedirectResponse(
        f"https://github.com/login/oauth/authorize?client_id={GITHUB_CLIENT_ID}&scope=user:email,read:org"
    )

@auth_router.get("/github/callback")
def github_callback(code: str):
    is_production = settings.ENVIRONMENT.lower() == "production"

    token_res = httpx.post(
        "https://github.com/login/oauth/access_token",
        data={

        "client_id": GITHUB_CLIENT_ID,
        "client_secret": GITHUB_CLIENT_SECRET,
        "code": code
        },
        headers={"Accept": "application/json"}
    ).json()

    access_token = token_res.get("access_token")
    if not  access_token:
        raise HTTPException(status_code=400, detail="Failed to get access token from github")

    user_res = httpx.get(
        "https://api.github.com/user",
        headers={"Authorization": f"Bearer {access_token}"}
    ).json()

    user_id = str(user_res.get("id"))
    username = user_res.get("login")

    jwt_token = create_access_token(data={"sub": user_id, "username": username})

    response = RedirectResponse(url="http://localhost:3000/dahsboard", status_code=303)

    response.set_cookie(
        key="access_token",
        value=jwt_token,
        httponly=True,
        secure=is_production,
        samesite="lax",
        max_age=60 * 60 * 24
    )

    return response