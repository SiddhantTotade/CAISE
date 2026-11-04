import json
import logging
import uuid
from datetime import datetime, timezone
from typing import Annotated, Any, AsyncIterator, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field, StringConstraints
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, get_optional_user
from app.api.v1.router import embedding_service, iso_utc, vector_store
from app.core.database import SessionLocal, get_db
from app.models.auth_models import Chat, ChatMessage, User
from app.services import keys as key_store
from app.services.llm.catalog import ModelSelection, list_catalog, resolve_selection
from app.services.llm.llm_service import SYSTEM_PROMPT, build_user_prompt
from app.services.llm.streaming_service import LLMStreamError, Messages, stream_tokens

logger = logging.getLogger(__name__)

chat_router = APIRouter(tags=["Chat"])

_SSE_HEADERS = {
    "Cache-Control": "no-cache",
    "Connection": "keep-alive",
    "X-Accel-Buffering": "no",  # stop nginx from buffering the stream
}


_MAX_HISTORY_ITEMS = 20  # prior messages (not turns) sent to the model
_MAX_PROMPT_CHARS = 32_000
_MAX_TITLE_CHARS = 60
_MAX_CHATS_LISTED = 100
_SOURCE_KEYS = ("repo_id", "file_path", "start_line", "end_line", "score")


class ChatRequest(BaseModel):
    prompt: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=_MAX_PROMPT_CHARS)]
    provider: Optional[str] = None  # defaults to settings.DEFAULT_LLM_PROVIDER
    model: Optional[str] = None  # defaults to the provider's configured default model
    repo_id: Optional[str] = None  # `url@branch` of one repo; None searches every repo the user may access
    chat_id: Optional[str] = None  # continue a stored chat; None starts a new one
    use_context: bool = True  # False -> plain chat without retrieval
    limit: int = Field(5, ge=1, le=20)  # number of code snippets retrieved


def _sse(event: str, data: Dict[str, Any]) -> str:
    # JSON-encoded data keeps newlines inside tokens from breaking SSE framing.
    return f"event: {event}\ndata: {json.dumps(data)}\n\n"


def _retrieve(prompt: str, user_id: str, repo_id: Optional[str], limit: int) -> List[Dict[str, Any]]:
    # Blocking (embedding model + vector store): call via run_in_threadpool.
    return vector_store.search(
        query_vector=embedding_service.get_embedding(prompt), user_id=user_id, repo_id=repo_id, limit=limit
    )


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _title_from(prompt: str) -> str:
    one_line = " ".join(prompt.split())
    return one_line if len(one_line) <= _MAX_TITLE_CHARS else one_line[: _MAX_TITLE_CHARS - 1].rstrip() + "…"


def _owned_chat(db: Session, user: User, chat_id: str) -> Chat:
    chat = db.get(Chat, chat_id)
    if chat is None or chat.user_id != user.id:
        raise HTTPException(status_code=404, detail="Chat not found")
    return chat


def _history(chat: Chat) -> Messages:
    """Stored turns as model input: complete user/assistant pairs only (a failed answer drops its whole turn)."""
    items: Messages = []
    msgs = chat.messages
    for i in range(0, len(msgs) - 1, 2):
        user_msg, answer = msgs[i], msgs[i + 1]
        if user_msg.role != "user" or answer.role != "assistant" or answer.error or not answer.content:
            continue
        items.append({"role": "user", "content": user_msg.content})
        items.append({"role": "assistant", "content": answer.content})
    return items[-_MAX_HISTORY_ITEMS:]


def _persist_answer(
    chat_id: str,
    answer: str,
    sources: Optional[List[Dict[str, Any]]],
    selection: ModelSelection,
    error: Optional[str],
    stopped: bool,
) -> None:
    """Store the assistant message. Runs in a `finally`, so it is synchronous and must never raise."""
    try:
        with SessionLocal() as db:
            now = _now()
            db.add(
                ChatMessage(
                    chat_id=chat_id, role="assistant", content=answer, sources=sources,
                    provider=selection.provider, model=selection.model, error=error,
                    stopped=stopped, created_at=now,
                )
            )
            chat = db.get(Chat, chat_id)
            if chat is not None:
                chat.updated_at = now
            db.commit()
    except Exception:
        logger.exception("Could not persist assistant message for chat %s", chat_id)


async def _event_stream(
    chat: Dict[str, str],
    selection: ModelSelection,
    sources: Optional[List[Dict[str, Any]]],
    first: Optional[str],
    tokens: AsyncIterator[str],
) -> AsyncIterator[str]:
    parts: List[str] = []
    error: Optional[str] = None
    finished = False
    try:
        yield _sse("chat", {"chat_id": chat["id"], "title": chat["title"]})
        yield _sse("start", {"provider": selection.provider, "model": selection.model})
        if sources is not None:
            yield _sse("sources", {"sources": sources})
        if first is not None:
            parts.append(first)
            yield _sse("token", {"text": first})
        async for text in tokens:
            parts.append(text)
            yield _sse("token", {"text": text})
        finished = True
        yield _sse("done", {"provider": selection.provider, "model": selection.model})
    except LLMStreamError as e:
        # Headers are already sent, so a mid-stream failure can only be reported in-band.
        error = e.message
        finished = True
        yield _sse("error", {"code": e.code, "message": e.message})
    finally:
        # Reached on completion, on error, and when the client disconnects (cancellation): in the last case
        # `finished` is still False, so the partial answer is stored as "stopped".
        _persist_answer(chat["id"], "".join(parts), sources, selection, error, stopped=not finished)
        await tokens.aclose()  # closes the upstream connection, including on client disconnect


@chat_router.get("/models")
def list_models(user: Optional[User] = Depends(get_optional_user), db: Session = Depends(get_db)) -> Dict[str, Any]:
    """Provider/model catalog for the frontend dropdown.

    `configured` is false for cloud providers with neither a server key nor a key saved by the caller.
    """
    own = set(key_store.list_keys(db, user.id)) if user is not None and not user.is_guest else set()
    return list_catalog(own)


@chat_router.get("/chats")
def list_chats(user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> Dict[str, Any]:
    count = func.count(ChatMessage.id)
    rows = db.execute(
        select(Chat, count)
        .outerjoin(ChatMessage, ChatMessage.chat_id == Chat.id)
        .where(Chat.user_id == user.id)
        .group_by(Chat.id)
        .order_by(Chat.updated_at.desc())
        .limit(_MAX_CHATS_LISTED)
    ).all()
    return {
        "chats": [
            {
                "id": c.id, "title": c.title, "repo_id": c.repo_id,
                "created_at": iso_utc(c.created_at), "updated_at": iso_utc(c.updated_at), "message_count": n,
            }
            for c, n in rows
        ]
    }


@chat_router.get("/chats/{chat_id}")
def get_chat(chat_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> Dict[str, Any]:
    chat = _owned_chat(db, user, chat_id)
    return {
        "id": chat.id, "title": chat.title, "repo_id": chat.repo_id,
        "created_at": iso_utc(chat.created_at), "updated_at": iso_utc(chat.updated_at),
        "messages": [
            {
                "id": m.id, "role": m.role, "content": m.content, "sources": m.sources,
                "provider": m.provider, "model": m.model, "error": m.error,
                "stopped": bool(m.stopped), "created_at": iso_utc(m.created_at),
            }
            for m in chat.messages
        ],
    }


@chat_router.delete("/chats/{chat_id}")
def delete_chat(chat_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> Dict[str, str]:
    db.delete(_owned_chat(db, user, chat_id))
    db.commit()
    return {"status": "ok"}


@chat_router.post("/chat/stream")
async def chat_stream(
    payload: ChatRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> StreamingResponse:
    """Stream a completion as Server-Sent Events: `chat`, `start`, `sources`?, `token`* (`{"text"}`), then `done` or `error`.

    The conversation is stored server-side: history comes from the stored chat (`chat_id`), and both the user
    message and the answer (also a partial one from a stopped or failed stream) are saved. `chat` carries the
    id and title of the (possibly new) chat. `sources` is sent only when `use_context` is true. The caller's
    own saved API key for the selected cloud provider is used automatically.

    Failures before the first token (bad model, retrieval, missing/invalid key, timeout, unreachable)
    return a real HTTP error status and store nothing; failures after streaming began arrive as an `error` event.
    """
    try:
        selection = resolve_selection(payload.provider, payload.model)
    except ValueError as e:
        raise HTTPException(status_code=400, detail={"code": "invalid_request", "message": str(e)})

    chat = _owned_chat(db, user, payload.chat_id) if payload.chat_id else None
    history: Messages = _history(chat) if chat else []

    chunks: List[Dict[str, Any]] = []
    if payload.use_context:
        try:
            chunks = await run_in_threadpool(_retrieve, payload.prompt, user.id, payload.repo_id, payload.limit)
        except Exception:
            logger.exception("Chat context retrieval failed")
            raise HTTPException(
                status_code=503,
                detail={"code": "retrieval_failed", "message": "Could not retrieve code context"},
            )

    messages: Messages = list(history)
    if chunks:
        messages.append({"role": "user", "content": build_user_prompt(payload.prompt, chunks)})
        system: Optional[str] = SYSTEM_PROMPT
    else:
        messages.append({"role": "user", "content": payload.prompt})
        system = None
    sources = [{k: c.get(k) for k in _SOURCE_KEYS} for c in chunks] if payload.use_context else None

    user_key = None if selection.provider == "ollama" or user.is_guest else key_store.get_key(db, user.id, selection.provider)
    tokens = stream_tokens(selection, messages, system, api_key_override=user_key)
    try:
        first: Optional[str] = await anext(tokens)
    except StopAsyncIteration:
        first = None
    except LLMStreamError as e:
        raise HTTPException(status_code=e.http_status, detail={"code": e.code, "message": e.message})

    # Only now that the provider accepted the request is anything stored.
    now = _now()
    if chat is None:
        chat = Chat(id=uuid.uuid4().hex, user_id=user.id, title=_title_from(payload.prompt), created_at=now)
        db.add(chat)
    chat.repo_id = payload.repo_id
    chat.updated_at = now
    db.add(ChatMessage(chat_id=chat.id, role="user", content=payload.prompt, created_at=now))
    db.commit()

    return StreamingResponse(
        _event_stream({"id": chat.id, "title": chat.title}, selection, sources, first, tokens),
        media_type="text/event-stream",
        headers=_SSE_HEADERS,
    )
