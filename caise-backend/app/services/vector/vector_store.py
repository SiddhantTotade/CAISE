from qdrant_client import QdrantClient
from qdrant_client.http import models
from pathlib import Path
from typing import List, Dict, Any
import uuid
from app.core.config import settings

class VectorStoreService:
    _client_instance = None

    def __init__(self, collection_name: str = "code_chunks"):
        self.collection_name = collection_name

    @property
    def client(self):
        """Thread-safe singleton client initialization to prevent Qdrant file lock collisions."""
        if VectorStoreService._client_instance is None:
            qdrant_path = settings.STORAGE_DIR / "qdrant_db"
            qdrant_path.mkdir(parents=True, exist_ok=True)
            
            # Initialize Qdrant local client
            VectorStoreService._client_instance = QdrantClient(path=str(qdrant_path))
            self._init_collection(VectorStoreService._client_instance)
            
        return VectorStoreService._client_instance

    def _init_collection(self, client: QdrantClient):
        try:
            collections_response = client.get_collections()
            existing_names = []
            if hasattr(collections_response, "collections"):
                existing_names = [c.name for c in collections_response.collections]
            elif isinstance(collections_response, dict):
                existing_names = [c.get("name") for c in collections_response.get("collections", [])]

            if self.collection_name not in existing_names:
                client.create_collection(
                    collection_name=self.collection_name,
                    vectors_config=models.VectorParams(
                        size=384, 
                        distance=models.Distance.COSINE
                    )
                )
                print(f"Created Qdrant collection: {self.collection_name}")
        except Exception as e:
            print(f"Note on collection init: {e}")

    def upsert_chunks(self, chunks: List[Dict[str, Any]], embeddings: List[List[float]], repo_id: str, allowed_users: List[str]):
        points = []
        for chunk, vector in zip(chunks, embeddings):
            point_id = str(uuid.uuid4())
            payload = {
                "file_path": str(chunk.get("file_path", "")),
                "chunk_type": str(chunk.get("chunk_type", "")),
                "name": str(chunk.get("name", "")),
                "start_line": int(chunk.get("start_line", 0)),
                "end_line": int(chunk.get("end_line", 0)),
                "content": str(chunk.get("content", "")),
                "repo_id": str(repo_id),
                "allowed_users": list(allowed_users)
            }
            points.append(
                models.PointStruct(
                    id=point_id,
                    vector=vector,
                    payload=payload
                )
            )
        
        self.client.upsert(
            collection_name=self.collection_name,
            points=points
        )
        print(f"Successfully upserted {len(points)} chunks into Qdrant for repo: {repo_id}")

    def search(self, query_vector: List[float], user_id: str, repo_id: str = None, limit: int = 5) -> List[Dict[str, Any]]:
        must_conditions = [
            models.FieldCondition(
                key="allowed_users",
                match=models.MatchValue(value=user_id)
            )
        ]
        
        if repo_id:
            must_conditions.append(
                models.FieldCondition(
                    key="repo_id",
                    match=models.MatchValue(value=repo_id)
                )
            )

        search_filter = models.Filter(must=must_conditions)

        # Updated to use query_points for newer qdrant-client versions
        response = self.client.query_points(
            collection_name=self.collection_name,
            query=query_vector,
            query_filter=search_filter,
            limit=limit
        )

        # query_points returns an object with a .points attribute
        results = response.points if hasattr(response, "points") else response

        return [
            {
                "score": hit.score,
                **(hit.payload or {})
            }
            for hit in results
        ]