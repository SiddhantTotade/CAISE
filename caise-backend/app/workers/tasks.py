import logging
from typing import Any, Dict, Optional

from app.core.celery import celery_app
from app.core.database import init_db
from app.services.pipeline import IndexingPipeline

logger = logging.getLogger(__name__)

init_db()
pipeline = IndexingPipeline()


@celery_app.task(name="tasks.process_repository_pipeline")
def process_repository_pipeline(
    repo_url: str,
    branch: str,
    access_token: Optional[str] = None,
    user_id: Optional[str] = None,
) -> Dict[str, Any]:
    logger.info("Starting pipeline for %s on branch %s", repo_url, branch)
    try:
        return pipeline.index(repo_url, branch, access_token, user_id)
    except Exception as e:
        logger.exception("Pipeline task failed for %s", repo_url)
        return {"status": "error", "error": str(e)}
