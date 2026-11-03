from sentence_transformers import SentenceTransformer
from typing import List

class EmbeddingService:
    def __init__(self, model_name: str = "all-MiniLM-L6-v2"):
        print(f"Loading embedding model ({model_name})")
        self.model = SentenceTransformer(model_name)

    def get_embedding(self, text: str) -> List[float]:
        embedding = self.model.encode(text, normalize_embeddings=True)
        return embedding.tolist()

    def get_embedding(self, texts: List[str]) -> List[List[float]]:
        embeddings = self.model.encode(texts, normalize_embeddings=True)
        return embeddings.tolist()