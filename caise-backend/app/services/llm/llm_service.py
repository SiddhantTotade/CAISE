from openai import OpenAI
from typing import List, Dict, Any

class LLMService:
    def __init__(self, model_name:str = "qwen2.5-coder:7b"):
        self.client = OpenAI(
            base_url="http://localhost:11434/v1",
            api_key="ollama"
        )

        self.model_name = model_name

    def generate_answer(self, query: str, retrieved_chunks: List[Dict[str, Any]]) -> str:
        context_blocks = []

        for i, chunks in enumerate(retrieved_chunks, 1):
            file_path = chunks.get("file_path", "unknown")
            start_line = chunks.get("start_line", 0)
            end_line = chunks.get("end_line", 0)
            content = chunks.get("content", "")

            context_blocks.append(f"--- Snippet {i}: {file_path} (Lines {start_line}-{end_line}) ---\n{content}\n")

        context_str = "\n".join(context_blocks)

        system_prompt = (
            "You are CAISE (Codebase Analysis and Intelligence Search Engine), an expert AI software engineer. "
            "Answer the user's question accurately using ONLY the provided codebase context snippets. "
            "Always cite the relevant file paths and line numbers when referencing code."
        )

        user_prompt = (
            f"User Question: {query}\n\n"
            f"Codebase Context:\n{context_str}\n\n"
            f"Provide a clear, technical explanation with exact code references."
        )

        try:
            response = self.client.chat.completions.create(
                model=self.model_name,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt}
                ],
                temperature=0.1
            )
            return response.choices[0].message.content
        except Exception as e:
            return f"Error generating Qwen LLM synthesis: {str(e)}. Make sure your Docker container is running (`docker start ollama`)."