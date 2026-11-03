from pathlib import Path

from app.core.celery import celery_app
from app.services.ingestion.git_cloner import GitIngestionService
from app.services.parser.ast_parser import ASTParserService
from app.services.vector.embedding_service import EmbeddingService
from app.services.vector.vector_store import VectorStoreService
from app.services.security.semgrep_scanner import SemgrepScannerService

git_service = GitIngestionService()
ast_parser = ASTParserService()
embedding_service = EmbeddingService()
vector_store = VectorStoreService()
semgrep_scanner = SemgrepScannerService()

@celery_app.task(name="tasks.process_repository_pipeline")
def process_repository_pipeline(repo_url: str, branch: str, access_token: str = None, user_id: str = None):
    print(f"Staring background pipeline for repository: {repo_url} on branch: {branch}")

    try:
        local_path = git_service.clone_or_pull_repository(
            repo_url=repo_url,
            branch=branch,
            access_token=access_token
        )

        chunks = ast_parser.parse_repository_directory(local_path)

        if not chunks:
            return {"status": "success", "message": "No parsable code chunks found", "chunk_indexed" : 0}

        texts = [chunk["content"] for chunk in chunks]
        embeddings = embedding_service.get_embedding(texts)

        repo_id = repo_url.rstrip("/").replace(".git", "")
        allowed_users = [user_id] if user_id else []

        vector_store.upsert_chunks(
            chunks=chunks,
            embeddings=embeddings,
            repo_id=repo_id,
            allowed_users=allowed_users
        )

        security_findings = semgrep_scanner.scan_repository(local_path)
        print(f"Successfully completed background pipeline for {repo_id}. Indexed {len(chunks)} chunks, found {len(security_findings)} security items.")

        return {
            "status": "success",
            "repo_id": repo_id,
            "chunks_indexed": len(chunks),
            "security_findings_count": len(security_findings),
            "security_findings": security_findings
        }

    except Exception as e:
        print(f"Pipeline task failed: {str(e)}")
        return {"status":"error", "error":str(e)}