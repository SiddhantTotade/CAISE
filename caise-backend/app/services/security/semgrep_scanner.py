import json
import logging
import subprocess
from pathlib import Path
from typing import Any, Dict, List, Optional

from app.core.config import settings

logger = logging.getLogger(__name__)

class SemgrepScannerService:
    def __init__(self, config: Optional[str] = None) -> None:
        self.config = config or settings.SEMGREP_CONFIG

    def scan_repository(self, repo_path: Path) -> List[Dict[str, Any]]:
        if not repo_path.exists():
            raise FileNotFoundError(f"Repository path does not exist: {repo_path}")

        cmd = [
            "semgrep", "scan", "--config", self.config, "--json", str(repo_path)
        ]

        try:
            result = subprocess.run(
                cmd,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
                check=False
            )

            if result.returncode not in [0, 1]:
                logger.warning("Semgrep execution error: %s", result.stderr)
                return []

            data = json.loads(result.stdout)
            findings = []

            for results in data.get("results", []):
                findings.append({
                    "check_id": results.get("check_id"),
                    "path": results.get("path"),
                    "start_line": results.get("start", {}).get("line"),
                    "end_line": results.get("end", {}).get("line"),
                    "message": results.get("extra", {}).get("message"),
                    "severity": results.get("extra", {}).get("severity"),
                    "confidence": results.get("extra", {}).get("metadata", {}).get("confidence", "MEDIUM")
                })

            return findings

        except json.JSONDecodeError:
            logger.error("Failed to parse semgrep JSON output")
            return []
        except Exception:
            logger.exception("Error running semgrep scan")
            return []