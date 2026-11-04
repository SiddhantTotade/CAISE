from pathlib import Path
from typing import List, Literal, Optional

from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

_INSECURE_SECRET_KEYS = {"", "super-secret-key", "replace_with_a_very_secure_random_secret_key"}


class Settings(BaseSettings):
    # Application core
    PROJECT_NAME: str = "CAISE"
    VERSION: str = "0.1.0"
    ENVIRONMENT: str = "development"
    API_V1_STR: str = "/api/v1"

    # Database & storage
    DATABASE_URL: str = "sqlite:///./caise_metadata.db"
    BASE_DIR: Path = Path(__file__).resolve().parent.parent.parent
    STORAGE_DIR: Path = BASE_DIR / "storage" / "repos"

    # Security & OAuth (GitHub)
    SECRET_KEY: str = "super-secret-key"
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24
    # Fernet key (urlsafe base64, 32 bytes) protecting users' saved LLM keys. Empty -> derived from SECRET_KEY.
    API_KEY_ENCRYPTION_KEY: str = ""
    # Anonymous users may index public repositories hosted on these hosts only.
    GUEST_ALLOWED_HOSTS: str = "github.com"
    GITHUB_CLIENT_ID: str = ""
    GITHUB_CLIENT_SECRET: str = ""
    GITHUB_REDIRECT_URI: str = "http://localhost:8000/api/v1/auth/github/callback"
    GITHUB_AUTHORIZE_URL: str = "https://github.com/login/oauth/authorize"
    GITHUB_TOKEN_URL: str = "https://github.com/login/oauth/access_token"
    GITHUB_API_URL: str = "https://api.github.com"
    GITHUB_OAUTH_SCOPE: str = "user:email,read:org"
    FRONTEND_URL: str = "http://localhost:3000"
    FRONTEND_POST_LOGIN_PATH: str = "/dashboard"
    # HMAC secret configured on the GitHub webhook; the webhook endpoint is disabled while empty.
    GITHUB_WEBHOOK_SECRET: str = ""

    # Celery / Redis
    CELERY_BROKER_URL: str = "redis://localhost:6379/0"
    CELERY_RESULT_BACKEND: str = "redis://localhost:6379/0"

    # Vector database (Qdrant)
    # QDRANT_MODE=local -> embedded store under STORAGE_DIR/qdrant_db; server -> QDRANT_HOST:QDRANT_PORT
    QDRANT_MODE: Literal["local", "server"] = "local"
    QDRANT_HOST: str = "localhost"
    QDRANT_PORT: int = 6333
    QDRANT_API_KEY: str = ""
    QDRANT_COLLECTION: str = "code_chunks"

    # Security scanner
    SEMGREP_CONFIG: str = "auto"

    # Embeddings (EMBEDDING_DIM must match the model's output size)
    EMBEDDING_MODEL: str = "all-MiniLM-L6-v2"
    EMBEDDING_DIM: int = 384

    # LLM providers
    DEFAULT_LLM_PROVIDER: str = "ollama"
    LLM_TEMPERATURE: float = 0.1
    LLM_MAX_TOKENS: int = 4096
    LLM_TIMEOUT_SECONDS: float = 120.0

    OPENAI_API_KEY: str = ""
    OPENAI_MODEL: str = "gpt-4o"
    ANTHROPIC_API_KEY: str = ""
    ANTHROPIC_MODEL: str = "claude-3-5-sonnet-20241022"
    DEEPSEEK_API_KEY: str = ""
    DEEPSEEK_BASE_URL: str = "https://api.deepseek.com"
    DEEPSEEK_MODEL: str = "deepseek-chat"

    OLLAMA_BASE_URL: str = "http://localhost:11434"
    DEFAULT_LOCAL_MODEL: str = "qwen2.5-coder:32b"
    # Comma-separated list for frontend dropdown population
    AVAILABLE_LOCAL_MODELS: str = "qwen2.5-coder:32b,llama3:8b,deepseek-r1:32b"
    # Comma-separated selectable models per cloud provider (the provider's default model is always included)
    AVAILABLE_OPENAI_MODELS: str = "gpt-4o,gpt-4o-mini"
    AVAILABLE_ANTHROPIC_MODELS: str = "claude-3-5-sonnet-20241022,claude-3-5-haiku-20241022"
    AVAILABLE_DEEPSEEK_MODELS: str = "deepseek-chat,deepseek-reasoner"

    @property
    def guest_hosts(self) -> List[str]:
        return [h.strip().lower() for h in self.GUEST_ALLOWED_HOSTS.split(",") if h.strip()]

    @property
    def local_models_list(self) -> List[str]:
        """Parses the comma-separated string into a list for the frontend selector UI."""
        return [m.strip() for m in self.AVAILABLE_LOCAL_MODELS.split(",") if m.strip()]

    @property
    def qdrant_api_key(self) -> Optional[str]:
        return self.QDRANT_API_KEY or None

    @property
    def is_production(self) -> bool:
        return self.ENVIRONMENT.lower() == "production"

    @model_validator(mode="after")
    def _finalize(self) -> "Settings":
        # A relative sqlite path would resolve against each process's cwd, splitting API and worker DBs.
        if self.DATABASE_URL.startswith("sqlite:///./"):
            db_file = (self.BASE_DIR / self.DATABASE_URL.removeprefix("sqlite:///./")).resolve()
            self.DATABASE_URL = f"sqlite:///{db_file}"
        if not self.STORAGE_DIR.is_absolute():
            self.STORAGE_DIR = (self.BASE_DIR / self.STORAGE_DIR).resolve()
        if self.is_production and self.SECRET_KEY in _INSECURE_SECRET_KEYS:
            raise ValueError("SECRET_KEY must be set to a strong random value in production")
        return self

    model_config = SettingsConfigDict(
        env_file=BASE_DIR / ".env", env_file_encoding="utf-8", extra="ignore"
    )


settings = Settings()
settings.STORAGE_DIR.mkdir(parents=True, exist_ok=True)
