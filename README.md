# CAISE

**Codebase AI Search & Evaluation** — index a Git repository, search it by meaning, and chat with answers grounded in the retrieved code and source locations.

CAISE keeps indexing asynchronous, supports incremental updates, and can use local Ollama or OpenAI, Anthropic, and DeepSeek models.

## Use cases

- **Onboard faster** — ask where a feature, flow, or dependency is implemented.
- **Navigate large repositories** — find relevant code by intent rather than exact keywords.
- **Review changes safely** — re-index only changed files and include Semgrep in changed indexing runs.
- **Keep code private** — run local embeddings, Qdrant, and Ollama on your own infrastructure.

## Tech stack

| Area | Technology |
| --- | --- |
| Web app | React 19, TypeScript, Vite, Tailwind CSS |
| API | Python, FastAPI, SQLAlchemy, SSE |
| Background jobs | Celery and Redis |
| Code intelligence | tree-sitter, GitPython, sentence-transformers |
| Retrieval | Qdrant with `all-MiniLM-L6-v2` embeddings |
| AI providers | Ollama, OpenAI, Anthropic, DeepSeek |
| Security | GitHub OAuth, JWT cookies, Semgrep |

## Architecture

<img src="docs/architecture.svg" alt="CAISE architecture: React browser talks to FastAPI; FastAPI uses Redis, Qdrant, SQLite, and an LLM. Celery workers receive jobs through Redis and index Git repositories, run Semgrep, and write Qdrant and SQLite." width="960" />

- The **FastAPI API** handles authentication, repository access, search, and streaming chat.
- **Celery workers** keep cloning, parsing, embedding, and scanning outside request handling.
- **Qdrant** stores code vectors; **SQLite** stores users, repositories, and chat metadata.
- Use `QDRANT_MODE=server` when the API and worker run together; embedded Qdrant is single-process.

## How it works

<img src="docs/workflow.svg" alt="CAISE workflow: clone or pull a selected branch, diff and chunk changed files, embed them into Qdrant, then retrieve allowed code chunks to ground a streamed LLM answer with sources." width="960" />

1. Add a repository and branch. CAISE clones it, or pulls an existing checkout.
2. A worker detects changed files, chunks supported code, creates embeddings, and updates Qdrant. A changed indexing run also runs Semgrep.
3. Ask a question. CAISE retrieves the most relevant chunks the signed-in user can access.
4. The selected LLM receives those chunks and streams an answer with file-and-line sources.

## Installation

### Prerequisites

- Python 3.12+, Node.js 20+, npm, Git, and Docker.
- Redis and Qdrant; the commands below start both locally.
- An LLM provider: [Ollama](https://ollama.com/) for local use, or an API key for OpenAI, Anthropic, or DeepSeek.

### 1. Install dependencies

```bash
git clone <repository-url> CAISE
cd CAISE

python3 -m venv venv
source venv/bin/activate
pip install -r caise-backend/requirements.txt

cd caise-frontend
cp .env.example .env
npm install
cd ..
```

### 2. Start Redis and Qdrant

```bash
docker run -d --name caise-redis -p 6379:6379 redis:7
docker run -d --name caise-qdrant -p 6333:6333 -p 6334:6334 \
  -v "$(pwd)/qdrant_storage:/qdrant/storage" qdrant/qdrant
```

### 3. Configure CAISE

Create `caise-backend/.env`:

```dotenv
SECRET_KEY=<generate with: python -c "import secrets; print(secrets.token_urlsafe(48))">
FRONTEND_URL=http://localhost:3000
CELERY_BROKER_URL=redis://localhost:6379/0
CELERY_RESULT_BACKEND=redis://localhost:6379/0
QDRANT_MODE=server
QDRANT_HOST=localhost
QDRANT_PORT=6333
DEFAULT_LLM_PROVIDER=ollama
OLLAMA_BASE_URL=http://localhost:11434
DEFAULT_LOCAL_MODEL=qwen2.5-coder:32b
```

For local chat, install Ollama and pull the configured model:

```bash
ollama pull qwen2.5-coder:32b
```

`caise-frontend/.env` should retain the copied defaults, including `VITE_BACKEND_URL=http://localhost:8000`, `VITE_DEV_PORT=3000`, and `VITE_API_PREFIX=/api/v1`.

## Run

Start each process in its own terminal. Run backend commands from `caise-backend/` with the virtual environment active.

```bash
# API
cd caise-backend
uvicorn app.main:app --reload --port 8000

# worker
cd caise-backend
celery -A app.core.celery.celery_app worker --loglevel=info

# frontend
cd caise-frontend
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). API documentation is available at [http://localhost:8000/docs](http://localhost:8000/docs).

## Use CAISE

1. Sign in with GitHub, or continue as a guest for public GitHub repositories.
2. Add a repository, choose its branch, and start indexing.
3. When the job is indexed, select it in the workspace and ask a question.
4. Read the streamed answer and open its cited source locations for context.
