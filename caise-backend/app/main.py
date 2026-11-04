import logging
from contextlib import asynccontextmanager
from typing import AsyncIterator

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.v1.auth_router import auth_router
from app.api.v1.chat_router import chat_router
from app.api.v1.keys_router import keys_router
from app.api.v1.router import api_router, vector_store, webhook_router
from app.core.config import settings
from app.core.database import init_db
from app.services.migrations import migrate_repo_ids

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncIterator[None]:
    init_db()
    try:
        migrate_repo_ids(vector_store)
    except Exception:  # Qdrant down at boot must not take the API with it; the migration is idempotent.
        logging.getLogger(__name__).exception("Repo id migration failed; will retry on next start")
    yield


app = FastAPI(
    title=settings.PROJECT_NAME,
    version=settings.VERSION,
    openapi_url=f"{settings.API_V1_STR}/openapi.json",
    lifespan=lifespan,
)

# Credentialed (cookie) requests are invalid with a wildcard origin; allow only the frontend.
app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.FRONTEND_URL],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router, prefix=settings.API_V1_STR)
app.include_router(webhook_router, prefix=settings.API_V1_STR)
app.include_router(auth_router, prefix=settings.API_V1_STR)
app.include_router(chat_router, prefix=settings.API_V1_STR)
app.include_router(keys_router, prefix=settings.API_V1_STR)


@app.get("/")
def root() -> dict[str, str]:
    return {"message": f"Welcome to {settings.PROJECT_NAME}", "docs": "/docs"}
