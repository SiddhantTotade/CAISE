from fastapi import APIRouter, HTTPException, Header, Request
from pydantic import BaseModel
from typing import List, Optional

from app.services.ingestion.git_cloner import GitIngestionService
from app.services.parser.ast_parser import ASTParserService
from app.services.vector.embedding_service import EmbeddingService
from app.services.vector.vector_store import VectorStoreService
from app.services.security.semgrep_scanner import SemgrepScannerService
from app.workers.tasks import process_repository_pipeline
from app.services.llm.llm_service import LLMService

api_router = APIRouter()
webhook_router = APIRouter()
git_service = GitIngestionService()
ast_parser = ASTParserService()
embedding_service = EmbeddingService()
vector_store = VectorStoreService()
semgrep_scanner = SemgrepScannerService()
llm_service = LLMService(model_name="qwen2.5-coder:7b")

class AskRequest(BaseModel):
    query: str
    user_id: str
    repo_id: Optional[str] = None
    limit: int = 5

class ManualTriggerRequest(BaseModel):
    repo_url: str
    branch: str = "master"
    access_token: Optional[str] = None
    user_id: str

class IngestionRequest(BaseModel):
    repo_url: str
    branch: str = "master"
    access_token: str|None = None

class IngestAndIndexRequest(BaseModel):
    repo_url: str
    branch: str = "master"
    access_token: Optional[str] = None
    user_id: str

class SearchRequest(BaseModel):
    query: str
    user_id: str
    repo_id: Optional[str] = None
    limit: int = 5

class AsyncIngestRequest(BaseModel):
    repo_url: str
    branch: str = "master"
    access_token: Optional[str] = None
    user_id: str

@api_router.post("/ask", tags=["RAG Intelligence"])
def ask_codebase(payload: AskRequest):
    try:
        query_vector = embedding_service.get_embedding(payload.query)

        retrieved_chunks = vector_store.search(
            query_vector=query_vector,
            user_id=payload.user_id,
            repo_id=payload.repo_id,
            limit=payload.limit
        )

        if not retrieved_chunks:
            return {
                "status": "success",
                "query": payload.query,
                "answer": "No relevant code snippets found ot you lack access permissions",
                "sources": []
            }

        answer = llm_service.generate_answer(payload.query, retrieved_chunks)

        return {
            "status": "success",
            "query": payload.query,
            "answer": answer,
            "sources": [
                {
                    "file_path": c.get("file_path"),
                    "start_line": c.get("start_line"),
                    "end_line": c.get("end_line"),
                    "score": c.get("score")
                } for c in retrieved_chunks
            ]
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@webhook_router.post("/github-webhook", tags=["Triggers & Webhooks"])
async def github_webhook_handler(request: Request, x_github_event: Optional[str] = Header(None)):
    try:
        payload = await request.json()
        
        if x_github_event != "push":
            return {
                "status": "ignored",
                "message": f"GitHub event '{x_github_event}' received but ignored (only 'push' events trigger indexing)"
            }

        repo_info = payload.get("repository", {})
        repo_url = repo_info.get("clone_url") or repo_info.get("html_url")

        if not repo_url:
            raise HTTPException(status_code=400, detail="Invalid webhook payload: repository URL not found")

        ref = payload.get("ref", "refs/heads/master")
        branch = ref.split("/")[-1]

        pusher = payload.get("pusher", {})
        user_id = pusher.get("name", "github_webhook_user")

        print(f"Webhook received push event for repo: {repo_url} on branch: {branch}")

        task = process_repository_pipeline.delay(
            repo_url = repo_url,
            branch = branch,
            access_token = None,
            user_id = user_id
        )

        return {
            "status" : "success",
            "message": "GitHub push webhook processed. Ingestion pipeline triggered in background",
            "task_id": task.id,
            "repo_url": repo_url,
            "branch": branch
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@webhook_router.post("/manual-trigger", tags=["Triggers & Webhooks"])
def manual_trigger_pipeline(payload: ManualTriggerRequest):
    try:
        task = process_repository_pipeline.delay(
            repo_url = payload.repo_url,
            branch = payload.branch,
            acess_token = payload.access_token,
            user_id = payload.user_id
        )

        return {
            "status": "success",
            "message": "Manual pipeline trigger queued successfully",
            "task_id": task.id
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@api_router.post("/index-repo-async", tags=["Async Pipeline Workers"])
def index_repository_async(payload: AsyncIngestRequest):
    try:
        task = process_repository_pipeline.delay(
            repo_url=payload.repo_url,
            branch=payload.branch,
            access_token=payload.access_token,
            user_id=payload.user_id
        )

        return {
            "status": "success",
            "message": "Repository ingestion task queued successfully",
            "task_id": task.id
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@api_router.get("/task-status/{task_id}", tags=["Async Pipeline Workers"])
def get_tasks_status(task_id: str):
    from celery.result import AsyncResult
    from app.core.celery import celery_app

    task_result = AsyncResult(task_id, app=celery_app)

    return {
        "task_id": task_id,
        "status": task_result.status,
        "result": task_result.result if task_result.ready() else None
    }

@api_router.post("/test-scan", tags=["Security Scanner Test"])
def test_scan(payload: IngestionRequest):
    try:
        local_path = git_service.clone_or_pull_repository(
            repo_url=payload.repo_url,
            branch=payload.branch,
            access_token=payload.access_token
        )

        findings = semgrep_scanner.scan_repository(local_path)

        return {
            "status": "success",
            "total_vulnerability_found": len(findings),
            "findings": findings[:10]
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@api_router.post("/index-repo", tags=["Pipeline"])
def index_repository(payload: IngestAndIndexRequest):
    try:
        local_path = git_service.clone_or_pull_repository(
            repo_url= payload.repo_url,
            branch=payload.branch,
            access_token=payload.access_token
        )

        chunks = ast_parser.parse_repository_directory(local_path)
        if not chunks:
            return {"status": "success", "message": "No parsable code chunk found"}

        texts = [chunk["content"] for chunk in chunks]
        embeddings = embedding_service.get_embedding(texts)

        repo_id = payload.repo_url.rstrip("/").replace(".git", "")
        allowed_users = [payload.user_id]

        vector_store.upsert_chunks  (
            chunks=chunks,
            embeddings=embeddings,
            repo_id=repo_id,
            allowed_users=allowed_users
        )

        return {
            "status": "success",
            "repo_id": repo_id,
            "total_chunks_indexed": len(chunks)
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@api_router.post("/search", tags=["Search"])
def search_code(payload: SearchRequest):
    try:
        query_vector = embedding_service.get_embedding(payload.query)
        results = vector_store.search(
            query_vector=query_vector,
            user_id=payload.user_id,
            repo_id=payload.repo_id,
            limit=payload.limit
        )

        return {
            "status": "success",
            "query": payload.query,
            "result_count": len(results),
            "results": results
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@api_router.post("/test-clone", tags=["Ingestion Test"])
def test_clone(payload: IngestionRequest):
    try:
        local_path = git_service.clone_or_pull_repository(repo_url=payload.repo_url,branch=payload.branch,access_token=payload.access_token)

        return {
            "status": "success",
            "message": "Repository successfully cloned/pulled",
            "local_path": str(local_path)
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@api_router.post("/test-parse", tags=["AST Parser Test"])
def test_parse(payload: IngestionRequest):
    try:
        local_path = git_service.clone_or_pull_repository(
            repo_url=payload.repo_url,
            branch=payload.branch,
            access_token=payload.access_token
        )

        chunks = ast_parser.parse_repository_directory(local_path)

        return {
            "status" : "success",
            "total_chunks_extracted": len(chunks),
            "sample_chunks": chunks[:3]
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@api_router.get("/health", tags=["Health"])
def helth_check():
    return {"status":"ok", "service":"CAISE", "version":"0.1.0"}