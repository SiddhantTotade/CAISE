from pathlib import Path
from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    PROJECT_NAME: str = "CAISE"
    VERSION: str = "0.1.0"
    APP_V1_STR: str = "/api/v1"

    ENVIRONMENT: str = "development"

    DATABASE_URL: str = "sqlite:///./caise_metadata.db"

    BASE_DIR: Path = Path(__file__).resolve().parent.parent.parent
    STORAGE_DIR: Path = BASE_DIR/"storage"/"repos"

    QDRANT_HOST: str = "localhost"
    QDRANT_PORT: str = 6333

    DEFULT_LLM_PROVIDER: str = "ollama"

    OPEN_API_KEY: str = ""
    ANTHROPIC_API_KEY: str = ""

    OLLAMA_BASE_URL: str = "http://localhost:11434"
    LOCAL_LLM_MODEL: str = "qwen2.5-coder:32b"

    model_config = SettingsConfigDict(
        env_file=".env", env_file_encoding="utf-8", extra="ignore"
    )

settings = Settings()

settings.STORAGE_DIR.mkdir(parents=True, exist_ok=True)