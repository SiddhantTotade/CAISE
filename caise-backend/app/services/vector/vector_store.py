import logging
import threading
import uuid
from typing import Any, Dict, List, Optional

from qdrant_client import QdrantClient
from qdrant_client.http import models

from app.core.config import settings

logger = logging.getLogger(__name__)


class VectorStoreService:
    _client_instance: Optional[QdrantClient] = None
    _lock = threading.Lock()

    def __init__(self, collection_name: str = settings.QDRANT_COLLECTION) -> None:
        self.collection_name = collection_name

    @property
    def client(self) -> QdrantClient:
        """Process-wide singleton client (embedded local storage would otherwise hit file-lock collisions)."""
        if VectorStoreService._client_instance is None:
            with VectorStoreService._lock:
                if VectorStoreService._client_instance is None:
                    client = self._create_client()
                    self._init_collection(client)
                    VectorStoreService._client_instance = client
        return VectorStoreService._client_instance

    @staticmethod
    def _create_client() -> QdrantClient:
        if settings.QDRANT_MODE == "server":
            return QdrantClient(
                host=settings.QDRANT_HOST,
                port=settings.QDRANT_PORT,
                api_key=settings.qdrant_api_key,
            )
        qdrant_path = settings.STORAGE_DIR / "qdrant_db"
        qdrant_path.mkdir(parents=True, exist_ok=True)
        return QdrantClient(path=str(qdrant_path))

    def _init_collection(self, client: QdrantClient) -> None:
        if client.collection_exists(self.collection_name):
            return
        client.create_collection(
            collection_name=self.collection_name,
            vectors_config=models.VectorParams(
                size=settings.EMBEDDING_DIM, distance=models.Distance.COSINE
            ),
        )
        logger.info("Created Qdrant collection: %s", self.collection_name)

    def upsert_chunks(
        self,
        chunks: List[Dict[str, Any]],
        embeddings: List[List[float]],
        repo_id: str,
        allowed_users: List[str],
    ) -> None:
        points = [
            models.PointStruct(
                id=str(uuid.uuid4()),
                vector=vector,
                payload={
                    "file_path": str(chunk.get("file_path", "")),
                    "chunk_type": str(chunk.get("chunk_type", "")),
                    "name": str(chunk.get("name", "")),
                    "start_line": int(chunk.get("start_line", 0)),
                    "end_line": int(chunk.get("end_line", 0)),
                    "content": str(chunk.get("content", "")),
                    "repo_id": str(repo_id),
                    "allowed_users": list(allowed_users),
                },
            )
            for chunk, vector in zip(chunks, embeddings)
        ]

        self.client.upsert(collection_name=self.collection_name, points=points)
        logger.info("Upserted %d chunks into Qdrant for repo: %s", len(points), repo_id)

    @staticmethod
    def _repo_filter(repo_id: str, file_paths: Optional[List[str]] = None) -> models.Filter:
        must = [models.FieldCondition(key="repo_id", match=models.MatchValue(value=repo_id))]
        if file_paths is not None:
            must.append(models.FieldCondition(key="file_path", match=models.MatchAny(any=file_paths)))
        return models.Filter(must=must)

    def delete_files(self, repo_id: str, file_paths: List[str]) -> None:
        """Drop every chunk of the given repo-relative files."""
        if not file_paths:
            return
        self.client.delete(
            collection_name=self.collection_name,
            points_selector=models.FilterSelector(filter=self._repo_filter(repo_id, file_paths)),
        )

    def delete_repo(self, repo_id: str) -> None:
        self.client.delete(
            collection_name=self.collection_name,
            points_selector=models.FilterSelector(filter=self._repo_filter(repo_id)),
        )

    def rename_repo(self, old_repo_id: str, new_repo_id: str) -> None:
        self.client.set_payload(
            collection_name=self.collection_name,
            payload={"repo_id": new_repo_id},
            points=self._repo_filter(old_repo_id),
        )

    def list_files(self, repo_id: str) -> Dict[str, int]:
        """Every indexed file of a repo with its chunk count."""
        counts: Dict[str, int] = {}
        offset = None
        while True:
            points, offset = self.client.scroll(
                collection_name=self.collection_name,
                scroll_filter=self._repo_filter(repo_id),
                limit=2000,
                offset=offset,
                with_payload=["file_path"],
                with_vectors=False,
            )
            for point in points:
                path = str((point.payload or {}).get("file_path", ""))
                counts[path] = counts.get(path, 0) + 1
            if offset is None:
                return counts

    def set_allowed_users(self, repo_id: str, allowed_users: List[str]) -> None:
        self.client.set_payload(
            collection_name=self.collection_name,
            payload={"allowed_users": list(allowed_users)},
            points=self._repo_filter(repo_id),
        )

    def search(
        self,
        query_vector: List[float],
        user_id: str,
        repo_id: Optional[str] = None,
        limit: int = 5,
    ) -> List[Dict[str, Any]]:
        must_conditions = [
            models.FieldCondition(key="allowed_users", match=models.MatchValue(value=user_id))
        ]
        if repo_id:
            must_conditions.append(
                models.FieldCondition(key="repo_id", match=models.MatchValue(value=repo_id))
            )

        response = self.client.query_points(
            collection_name=self.collection_name,
            query=query_vector,
            query_filter=models.Filter(must=must_conditions),
            limit=limit,
        )

        return [{"score": hit.score, **(hit.payload or {})} for hit in response.points]
