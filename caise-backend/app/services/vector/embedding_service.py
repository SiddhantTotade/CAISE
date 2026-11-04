import logging
from functools import cached_property
from typing import List

from sentence_transformers import SentenceTransformer

from app.core.config import settings

logger = logging.getLogger(__name__)


class EmbeddingService:
    def __init__(self, model_name: str = settings.EMBEDDING_MODEL) -> None:
        self.model_name = model_name

    @cached_property
    def model(self) -> SentenceTransformer:
        # Loaded on first use, inside the process that encodes. A Celery prefork worker imports this
        # module before forking; a model moved to CUDA in the parent cannot be used in the children.
        logger.info("Loading embedding model (%s)", self.model_name)
        return SentenceTransformer(self.model_name)

    def get_embedding(self, text: str) -> List[float]:
        return self.model.encode(text, normalize_embeddings=True).tolist()

    def get_embeddings(self, texts: List[str]) -> List[List[float]]:
        return self.model.encode(texts, normalize_embeddings=True).tolist()
