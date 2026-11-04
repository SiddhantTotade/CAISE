import logging
from pathlib import Path
from typing import Any, Dict, Iterable, List

import tree_sitter_python as tspython
from tree_sitter import Language, Parser

logger = logging.getLogger(__name__)

SUPPORTED_SUFFIXES = frozenset({".py", ".js", ".ts", ".java", ".go", ".rs", ".md", ".json"})

class ASTParserService:
    def __init__(self):
        self.py_language = Language(tspython.language())
        self.parser = Parser(self.py_language)

    def parse_file(self, file_path: Path, root: Path) -> List[Dict[str, Any]]:
        """Chunk one file; chunks carry the path relative to `root` so they match `git diff` output."""
        if not file_path.exists():
            raise FileNotFoundError(f"File not found: {file_path}")

        code_bytes = file_path.read_bytes()
        rel_path = file_path.relative_to(root).as_posix()

        if file_path.suffix == ".py":
            return self._parse_python_ast(code_bytes, rel_path)
        return self._fallback_generic_chunking(code_bytes, rel_path)

    def _parse_python_ast(self, code_bytes: bytes, file_path: str) -> List[Dict[str, Any]]:
        tree = self.parser.parse(code_bytes)
        root_node = tree.root_node
        
        # Traverse the AST to extract classes and functions recursively
        chunks = self._traverse_node(root_node, code_bytes, file_path)

        if not chunks:
            chunks.append({
                "file_path": file_path,
                "chunk_type": "module",
                "name": "root",
                "start_line": 1,
                "end_line": len(code_bytes.decode("utf-8", errors="ignore").splitlines()),
                "content": code_bytes.decode("utf-8", errors="ignore")
            })

        return chunks

    def _traverse_node(self, node, code_bytes: bytes, file_path: str) -> List[Dict[str, Any]]:
        chunks = []

        if node.type in ["function_definition", "class_definition"]:
            start_point = node.start_point
            end_point = node.end_point

            snippet = code_bytes[node.start_byte:node.end_byte].decode("utf-8", errors="ignore")

            name = "anonymous"
            for child in node.children:
                if child.type == "identifier":
                    name = code_bytes[child.start_byte:child.end_byte].decode("utf-8", errors="ignore")
                    break

            chunks.append({
                "file_path": file_path,
                "chunk_type": node.type,
                "name": name,
                "start_line": start_point[0] + 1,
                "end_line": end_point[0] + 1,
                "content": snippet
            })
        else:
            for child in node.children:
                chunks.extend(self._traverse_node(child, code_bytes, file_path))

        return chunks

    def _fallback_generic_chunking(self, code_bytes: bytes, file_path: str, max_lines: int = 100) -> List[Dict[str,Any]]:
        text = code_bytes.decode("utf-8", errors="ignore")
        lines = text.splitlines()
        chunks = []

        for i in range(0, len(lines), max_lines):
            chunk_lines = lines[i:i + max_lines]
            chunks.append({
                "file_path": file_path,
                "chunk_type": "block",
                "name": f"lines_{i+1}_to_{i+len(chunk_lines)}",
                "start_line": i + 1,
                "end_line": i + len(chunk_lines),
                "content": "\n".join(chunk_lines)
            })

        return chunks

    @staticmethod
    def is_supported(path: Path) -> bool:
        return path.suffix in SUPPORTED_SUFFIXES

    def parse_files(self, root: Path, relative_paths: Iterable[str]) -> List[Dict[str, Any]]:
        """Chunk the given repo-relative files; unsupported, missing and symlinked paths are skipped."""
        chunks: List[Dict[str, Any]] = []
        for rel in relative_paths:
            file_path = root / rel
            # Symlinks could point outside the checkout; never follow them.
            if not self.is_supported(file_path) or file_path.is_symlink() or not file_path.is_file():
                continue
            try:
                chunks.extend(self.parse_file(file_path, root))
            except Exception as e:
                logger.warning("Skipping file %s due to parse error: %s", file_path, e)
        return chunks

    def parse_repository_directory(self, repo_path: Path) -> List[Dict[str, Any]]:
        relative_paths = (
            p.relative_to(repo_path).as_posix()
            for p in repo_path.rglob("*")
            if ".git" not in p.relative_to(repo_path).parts
        )
        return self.parse_files(repo_path, relative_paths)
