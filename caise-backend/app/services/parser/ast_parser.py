from pathlib import Path
from typing import List, Dict, Any
import tree_sitter_python as tspython
from tree_sitter import Language, Parser

class ASTParserService:
    def __init__(self):
        self.py_language = Language(tspython.language())
        self.parser = Parser(self.py_language)

    def parse_file(self, file_path: Path) -> List[Dict[str, Any]]:
        if not file_path.exists():
            raise FileNotFoundError(f"File not found: {file_path}")

        code_bytes = file_path.read_bytes()

        if file_path.suffix == ".py":
            return self._parse_python_ast(code_bytes, str(file_path))
        else:
            return self._fallback_generic_chunking(code_bytes, str(file_path))

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

    def parse_repository_directory(self, repo_path: Path) -> List[Dict[str, Any]]:
        all_chunks = []

        for file_path in repo_path.rglob("*"):
            if file_path.is_file() and ".git" not in file_path.parts:
                if file_path.suffix in [".py", ".js", ".ts", ".java", ".go", ".rs", ".md", ".json"]:
                    try:
                        file_chunks = self.parse_file(file_path)
                        all_chunks.extend(file_chunks)
                    except Exception as e:
                        print(f"Skipping file {file_path} due to parse error: {e}")

        return all_chunks