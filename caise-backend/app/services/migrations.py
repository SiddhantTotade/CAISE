import logging
import shutil

from sqlalchemy import select

from app.core.database import SessionLocal
from app.models.auth_models import RepositoryMetadata
from app.services.ingestion.git_cloner import GitIngestionService, make_repo_id
from app.services.vector.vector_store import VectorStoreService

logger = logging.getLogger(__name__)


def migrate_repo_ids(vectors: VectorStoreService) -> int:
    """Rewrite legacy bare-URL repo ids to `url@branch` (metadata row, Qdrant payloads, checkout dir).

    Idempotent: rows already in the new form are skipped. Returns the number of repositories migrated.
    """
    git = GitIngestionService()
    migrated = 0
    with SessionLocal() as db:
        for meta in db.scalars(select(RepositoryMetadata)).all():
            new_id = make_repo_id(meta.repo_url, meta.branch)
            if meta.repo_id == new_id:
                continue
            if db.get(RepositoryMetadata, new_id) is not None:
                logger.warning("Legacy repo %s collides with %s; leaving it untouched", meta.repo_id, new_id)
                continue

            old_id = meta.repo_id
            vectors.rename_repo(old_id, new_id)
            _move_checkout(git, old_id, meta.repo_url, meta.branch)
            # repo_id is the primary key: insert the renamed row, then drop the old one.
            db.add(
                RepositoryMetadata(
                    repo_id=new_id,
                    repo_url=meta.repo_url,
                    branch=meta.branch,
                    org_id=meta.org_id,
                    owner_id=meta.owner_id,
                    allowed_users=meta.allowed_users,
                    status=meta.status,
                    last_index_commit=meta.last_index_commit,
                    updated_at=meta.updated_at,
                    last_index_changes=meta.last_index_changes,
                )
            )
            db.delete(meta)
            db.commit()
            migrated += 1
            logger.info("Migrated repo id %s -> %s", old_id, new_id)
    return migrated


def _move_checkout(git: GitIngestionService, old_id: str, repo_url: str, branch: str) -> None:
    """Move the pre-branch checkout (`<org>/<repo>`) to its per-branch location."""
    org, name = git._split_url(repo_url)
    old_path = git.storage_dir / org / name
    new_path = git._target_path(repo_url, branch)
    if old_path.exists() and not new_path.exists():
        shutil.move(str(old_path), str(new_path))
