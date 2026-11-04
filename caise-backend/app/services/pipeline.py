import logging
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

from git import Repo
from sqlalchemy.orm import Session

from app.core.database import SessionLocal
from app.models.auth_models import RepositoryMetadata
from app.services.ingestion.git_cloner import GitIngestionService, make_repo_id, normalize_repo_url
from app.services.ingestion.git_service import get_file_diff
from app.services.parser.ast_parser import ASTParserService
from app.services.security.semgrep_scanner import SemgrepScannerService
from app.services.vector.embedding_service import EmbeddingService
from app.services.vector.vector_store import VectorStoreService

logger = logging.getLogger(__name__)

STATUS_INDEXING = "indexing"
STATUS_INDEXED = "indexed"
STATUS_FAILED = "failed"

# Per-list cap on the change summary stored for the UI.
MAX_CHANGE_PATHS = 500


class IndexingPipeline:
    """Clone/pull -> (incremental) parse -> embed -> upsert, tracked in RepositoryMetadata."""

    def __init__(self) -> None:
        self.git = GitIngestionService()
        self.parser = ASTParserService()
        self.embeddings = EmbeddingService()
        self.vectors = VectorStoreService()
        self.scanner = SemgrepScannerService()

    def index(
        self, repo_url: str, branch: str, access_token: Optional[str], user_id: Optional[str]
    ) -> Dict[str, Any]:
        repo_url = normalize_repo_url(repo_url)
        repo_id = make_repo_id(repo_url, branch)
        with SessionLocal() as db:
            meta = db.get(RepositoryMetadata, repo_id)
            created = meta is None
            if created:
                if not user_id:
                    raise ValueError("Repository is not registered; an authenticated user is required")
                meta = RepositoryMetadata(
                    repo_id=repo_id, repo_url=repo_url, branch=branch, owner_id=user_id, allowed_users=[]
                )
                db.add(meta)
            else:
                meta.status = STATUS_INDEXING
            db.commit()

            try:
                return self._run(db, meta, user_id, access_token)
            except Exception:
                if created:
                    # Do not let a failed first attempt squat the repo id / owner slot.
                    db.delete(meta)
                else:
                    meta.status = STATUS_FAILED
                db.commit()
                raise

    def _run(
        self, db: Session, meta: RepositoryMetadata, user_id: Optional[str], access_token: Optional[str]
    ) -> Dict[str, Any]:
        repo_id, branch = meta.repo_id, meta.branch
        local_path = self.git.clone_or_pull_repository(meta.repo_url, branch, access_token)

        # Reaching here proves the caller can read the repo (the clone/pull succeeded with their
        # credentials), so only now is access granted.
        allowed = list(meta.allowed_users or [])
        access_changed = bool(user_id) and user_id not in allowed
        if access_changed:
            allowed.append(user_id)
            meta.allowed_users = allowed
            db.commit()

        head = Repo(local_path).head.commit.hexsha
        previous_commit = meta.last_index_commit

        if previous_commit == head:
            if access_changed:
                self.vectors.set_allowed_users(repo_id, allowed)
            meta.status = STATUS_INDEXED
            db.commit()
            return {"status": "success", "repo_id": repo_id, "mode": "unchanged", "commit": head,
                    "chunks_indexed": 0}

        changed = self._changed_files(local_path, previous_commit, head)
        if changed is None:
            mode = "full"
            self.vectors.delete_repo(repo_id)
            chunks = self.parser.parse_repository_directory(local_path)
            modified, added, deleted = [], list(dict.fromkeys(c["file_path"] for c in chunks)), []
        else:
            mode = "incremental"
            modified, added, deleted = changed
            # Added files are cleared too so a retry after a failed run cannot duplicate chunks.
            self.vectors.delete_files(repo_id, modified + added + deleted)
            chunks = self.parser.parse_files(local_path, modified + added)

        if chunks:
            vectors = self.embeddings.get_embeddings([c["content"] for c in chunks])
            self.vectors.upsert_chunks(chunks, vectors, repo_id, allowed)
        if access_changed:
            self.vectors.set_allowed_users(repo_id, allowed)

        findings = self.scanner.scan_repository(local_path)

        meta.last_index_commit = head
        meta.status = STATUS_INDEXED
        meta.updated_at = datetime.now(timezone.utc)
        meta.last_index_changes = {
            "mode": mode,
            "modified": modified[:MAX_CHANGE_PATHS],
            "added": added[:MAX_CHANGE_PATHS],
            "deleted": deleted[:MAX_CHANGE_PATHS],
        }
        db.commit()
        logger.info("Indexed %s@%s (%s): %d chunks, %d findings", repo_id, head[:8], mode, len(chunks), len(findings))
        return {
            "status": "success",
            "repo_id": repo_id,
            "mode": mode,
            "commit": head,
            "chunks_indexed": len(chunks),
            "security_findings_count": len(findings),
            "security_findings": findings,
        }

    @staticmethod
    def _changed_files(
        local_path: Path, previous_commit: Optional[str], head: str
    ) -> Optional[tuple[List[str], List[str], List[str]]]:
        """Diff since the last indexed commit, or None when a full re-index is required."""
        if not previous_commit:
            return None
        try:
            return get_file_diff(str(local_path), previous_commit, head)
        except ValueError:
            # Previous commit is gone (force-push / re-clone): the diff is meaningless.
            logger.warning("Cannot diff %s..%s; falling back to full index", previous_commit[:8], head[:8])
            return None
