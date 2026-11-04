import hashlib
import hmac
import logging
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from celery.result import AsyncResult
from fastapi import APIRouter, Depends, Header, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.core.celery import celery_app
from app.core.config import settings
from app.core.database import get_db
from app.models.auth_models import RepositoryMetadata, User
from app.services.ingestion.git_cloner import (
    GitIngestionService,
    RemoteError,
    make_repo_id,
    normalize_repo_url,
    repo_host,
)
from app.services.llm.llm_service import generate_answer
from app.services.llm.provider import SUPPORTED_PROVIDERS
from app.services.vector.embedding_service import EmbeddingService
from app.services.vector.vector_store import VectorStoreService
from app.workers.tasks import process_repository_pipeline

logger = logging.getLogger(__name__)

api_router = APIRouter()
webhook_router = APIRouter()

embedding_service = EmbeddingService()
vector_store = VectorStoreService()
git_service = GitIngestionService()


class SearchRequest(BaseModel):
    query: str
    repo_id: Optional[str] = None
    limit: int = Field(default=5, ge=1, le=50)


class AskRequest(SearchRequest):
    provider: Optional[str] = None
    model: Optional[str] = None


class IndexRequest(BaseModel):
    repo_url: str
    branch: str
    # GitHub token for private repositories; used for this run only and never stored.
    access_token: Optional[str] = None


class BranchesRequest(BaseModel):
    repo_url: str
    access_token: Optional[str] = None  # used for this call only, never stored


def _require_public_for_guest(user: User, repo_url: str, access_token: Optional[str]) -> None:
    """Guests may only touch public repositories on the allow-listed hosts, and never supply credentials."""
    if not user.is_guest:
        return
    if access_token or repo_host(repo_url) not in settings.guest_hosts:
        raise HTTPException(
            status_code=400,
            detail={"code": "public_only", "message": "Guests can only use public repositories on " + ", ".join(settings.guest_hosts)},
        )


def _accessible_repos(db: Session, user: User) -> List[RepositoryMetadata]:
    return [r for r in db.scalars(select(RepositoryMetadata)) if user.id in (r.allowed_users or [])]


def _search(payload: SearchRequest, user: User) -> List[Dict[str, Any]]:
    return vector_store.search(
        query_vector=embedding_service.get_embedding(payload.query),
        user_id=user.id,
        repo_id=payload.repo_id,
        limit=payload.limit,
    )


def iso_utc(value: Optional[datetime]) -> Optional[str]:
    if value is None:
        return None
    # SQLite drops tzinfo on read; stored values are always UTC.
    return (value if value.tzinfo else value.replace(tzinfo=timezone.utc)).isoformat()


@api_router.post("/index-repo-async", tags=["Indexing"])
def index_repository_async(payload: IndexRequest, user: User = Depends(get_current_user)) -> Dict[str, Any]:
    repo_url = normalize_repo_url(payload.repo_url)
    try:
        GitIngestionService.validate(repo_url, payload.branch)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    _require_public_for_guest(user, repo_url, payload.access_token)

    task = process_repository_pipeline.delay(
        repo_url=repo_url,
        branch=payload.branch,
        access_token=payload.access_token,
        user_id=user.id,
    )
    return {
        "status": "success",
        "message": "Repository indexing queued",
        "task_id": task.id,
        "repo_id": make_repo_id(repo_url, payload.branch),
    }


@api_router.get("/task-status/{task_id}", tags=["Indexing"])
def get_task_status(task_id: str, _: User = Depends(get_current_user)) -> Dict[str, Any]:
    task_result = AsyncResult(task_id, app=celery_app)
    return {
        "task_id": task_id,
        "status": task_result.status,
        "result": task_result.result if task_result.ready() else None,
    }


@api_router.get("/repos", tags=["Indexing"])
def list_repositories(
    user: User = Depends(get_current_user), db: Session = Depends(get_db)
) -> List[Dict[str, Any]]:
    return [
        {
            "repo_id": r.repo_id,
            "repo_url": r.repo_url,
            "branch": r.branch,
            "status": r.status,
            "last_index_commit": r.last_index_commit,
            "updated_at": iso_utc(r.updated_at),
            "changes": r.last_index_changes,
            "is_owner": r.owner_id == user.id,
        }
        for r in _accessible_repos(db, user)
    ]


@api_router.post("/repos/branches", tags=["Indexing"])
def list_branches(
    payload: BranchesRequest, user: User = Depends(get_current_user), db: Session = Depends(get_db)
) -> Dict[str, Any]:
    """Branches of a repository: those on the remote, plus which of them the caller has indexed."""
    repo_url = normalize_repo_url(payload.repo_url)
    _require_public_for_guest(user, repo_url, payload.access_token)

    indexed = {r.branch: r.repo_id for r in _accessible_repos(db, user) if r.repo_url == repo_url}
    default: Optional[str] = None
    remote_error: Optional[str] = None
    try:
        default, remote = GitIngestionService.list_remote_branches(repo_url, payload.access_token)
    except ValueError as e:
        raise HTTPException(status_code=400, detail={"code": "invalid_repository", "message": str(e)})
    except RemoteError as e:
        if not indexed:
            raise HTTPException(status_code=502, detail={"code": "remote_unreachable", "message": e.message})
        remote, remote_error = [], e.message

    names = list(dict.fromkeys([*remote, *sorted(indexed)]))
    return {
        "repo_url": repo_url,
        "default_branch": default,
        "branches": [{"name": n, "indexed": n in indexed, "repo_id": indexed.get(n)} for n in names],
        "remote_error": remote_error,
    }


@api_router.get("/repos/files", tags=["Indexing"])
def list_repository_files(
    repo_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)
) -> Dict[str, Any]:
    """Every file indexed for a repository branch (the files CAISE analyzes when answering)."""
    meta = db.get(RepositoryMetadata, repo_id)
    if meta is None or user.id not in (meta.allowed_users or []):
        raise HTTPException(status_code=404, detail="Repository not found")
    counts = vector_store.list_files(repo_id)
    return {
        "repo_id": repo_id,
        "total": len(counts),
        "files": [{"path": p, "chunks": counts[p]} for p in sorted(counts)],
    }


@api_router.delete("/repos", tags=["Indexing"])
def delete_repository(
    repo_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)
) -> Dict[str, str]:
    meta = db.get(RepositoryMetadata, repo_id)
    if meta is None or user.id not in (meta.allowed_users or []):
        raise HTTPException(status_code=404, detail="Repository not found")
    if meta.owner_id != user.id:
        raise HTTPException(status_code=403, detail="Only the repository owner can delete it")

    vector_store.delete_repo(repo_id)
    git_service.cleanup_repository(meta.repo_url, meta.branch)
    db.delete(meta)
    db.commit()
    return {"status": "success", "repo_id": repo_id}


@api_router.post("/search", tags=["Search"])
def search_code(payload: SearchRequest, user: User = Depends(get_current_user)) -> Dict[str, Any]:
    results = _search(payload, user)
    return {"status": "success", "query": payload.query, "result_count": len(results), "results": results}


@api_router.post("/ask", tags=["RAG Intelligence"])
def ask_codebase(payload: AskRequest, user: User = Depends(get_current_user)) -> Dict[str, Any]:
    chunks = _search(payload, user)
    if not chunks:
        return {
            "status": "success",
            "query": payload.query,
            "answer": "No relevant code snippets found or you lack access permissions",
            "sources": [],
        }

    try:
        answer = generate_answer(payload.query, chunks, provider=payload.provider, model_name=payload.model)
    except ValueError as e:  # bad provider/model selection or missing API key
        raise HTTPException(status_code=400, detail=str(e))
    except Exception:
        logger.exception("LLM provider call failed")
        raise HTTPException(status_code=502, detail="LLM provider request failed")

    return {
        "status": "success",
        "query": payload.query,
        "answer": answer,
        "sources": [
            {k: c.get(k) for k in ("repo_id", "file_path", "start_line", "end_line", "score")} for c in chunks
        ],
    }


@api_router.get("/health", tags=["Health"])
def health_check() -> Dict[str, str]:
    return {"status": "ok", "service": settings.PROJECT_NAME, "version": settings.VERSION}


@api_router.get("/llm/models", tags=["LLM"])
def list_llm_models() -> Dict[str, Any]:
    """Options for the frontend model selector."""
    return {
        "default_provider": settings.DEFAULT_LLM_PROVIDER,
        "providers": list(SUPPORTED_PROVIDERS),
        "default_local_model": settings.DEFAULT_LOCAL_MODEL,
        "local_models": settings.local_models_list,
    }


def _valid_signature(body: bytes, signature: Optional[str]) -> bool:
    if not settings.GITHUB_WEBHOOK_SECRET or not signature:
        return False
    expected = "sha256=" + hmac.new(settings.GITHUB_WEBHOOK_SECRET.encode(), body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, signature)


@webhook_router.post("/github-webhook", tags=["Webhooks"])
async def github_webhook_handler(
    request: Request,
    x_github_event: Optional[str] = Header(None),
    x_hub_signature_256: Optional[str] = Header(None),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    """Re-index an already registered repository when its tracked branch receives a push."""
    body = await request.body()
    if not _valid_signature(body, x_hub_signature_256):
        raise HTTPException(status_code=401, detail="Invalid webhook signature")
    if x_github_event != "push":
        return {"status": "ignored", "message": f"Event '{x_github_event}' ignored; only 'push' triggers indexing"}

    payload = await request.json()
    repo_info = payload.get("repository", {})
    repo_url = repo_info.get("clone_url") or repo_info.get("html_url")
    if not repo_url:
        raise HTTPException(status_code=400, detail="Repository URL not found in payload")

    branch = payload.get("ref", "").removeprefix("refs/heads/")
    meta = db.get(RepositoryMetadata, make_repo_id(repo_url, branch))
    if meta is None:
        return {"status": "ignored", "message": f"Branch '{branch}' of this repository is not registered"}

    task = process_repository_pipeline.delay(
        repo_url=meta.repo_url, branch=meta.branch, access_token=None, user_id=meta.owner_id
    )
    logger.info("Webhook push for %s@%s queued as %s", meta.repo_id, branch, task.id)
    return {"status": "success", "task_id": task.id, "repo_id": meta.repo_id, "branch": branch}
