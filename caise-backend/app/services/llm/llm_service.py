from typing import Any, Dict, List, Optional

from app.services.llm.provider import get_llm_service

SYSTEM_PROMPT = (
    "You are CAISE (Codebase AI Search & Evaluation), an expert AI software engineer. "
    "Answer the user's question accurately using ONLY the provided codebase context snippets. "
    "Always cite the relevant file paths and line numbers when referencing code."
)


def format_context(retrieved_chunks: List[Dict[str, Any]]) -> str:
    blocks = []
    for i, chunk in enumerate(retrieved_chunks, 1):
        blocks.append(
            f"--- Snippet {i}: {chunk.get('file_path', 'unknown')} "
            f"(Lines {chunk.get('start_line', 0)}-{chunk.get('end_line', 0)}) ---\n"
            f"{chunk.get('content', '')}\n"
        )
    return "\n".join(blocks)


def build_user_prompt(query: str, retrieved_chunks: List[Dict[str, Any]]) -> str:
    return (
        f"User Question: {query}\n\n"
        f"Codebase Context:\n{format_context(retrieved_chunks)}\n\n"
        "Provide a clear, technical explanation with exact code references."
    )


def generate_answer(
    query: str,
    retrieved_chunks: List[Dict[str, Any]],
    provider: Optional[str] = None,
    model_name: Optional[str] = None,
) -> str:
    """Synthesize an answer from retrieved chunks with the selected provider/model.

    Raises ValueError for invalid provider/model selection; provider errors propagate.
    """
    llm = get_llm_service(provider, model_name)
    return llm.generate_response(build_user_prompt(query, retrieved_chunks), SYSTEM_PROMPT)
