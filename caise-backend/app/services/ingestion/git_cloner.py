import logging
import re
import base64
import os
import shutil
import subprocess
from pathlib import Path
from typing import List, Optional, Tuple
from urllib.parse import quote, urlsplit

from git import GitCommandError, Repo

from app.core.config import settings
from app.services.ingestion.git_service import is_valid_git_ref

logger = logging.getLogger(__name__)

_REPO_URL_RE = re.compile(r"^https?://[A-Za-z0-9.-]+(:\d+)?(/[A-Za-z0-9_.-]+)+/?$")
_PATH_PART_RE = re.compile(r"^[A-Za-z0-9_][A-Za-z0-9_.-]*$")
_DEFAULT_ORG = "default"
_LS_REMOTE_TIMEOUT_SECONDS = 25
MAX_BRANCHES = 500


class RemoteError(Exception):
    """`git ls-remote` failed; `message` is safe to show to the user (never contains credentials)."""

    def __init__(self, message: str) -> None:
        super().__init__(message)
        self.message = message


def normalize_repo_url(repo_url: str) -> str:
    """Canonical form used for ids and storage: no trailing slash and no `.git` suffix."""
    return repo_url.strip().rstrip("/").removesuffix(".git").rstrip("/")


def make_repo_id(repo_url: str, branch: str) -> str:
    """One indexed entry per repository URL and branch."""
    return f"{normalize_repo_url(repo_url)}@{branch}"


def repo_host(repo_url: str) -> str:
    return (urlsplit(repo_url).hostname or "").lower()


class GitIngestionService:
    def __init__(self) -> None:
        self.storage_dir = settings.STORAGE_DIR

    @staticmethod
    def validate(repo_url: str, branch: str) -> None:
        if not _REPO_URL_RE.fullmatch(repo_url) or ".." in repo_url.split("/"):
            raise ValueError("Invalid repository URL: only http(s) URLs are supported")
        if not is_valid_git_ref(branch):
            raise ValueError("Invalid branch name")

    @staticmethod
    def _split_url(repo_url: str) -> Tuple[str, str]:
        parts = repo_url.rstrip("/").split("/")
        repo_name = parts[-1].removesuffix(".git")
        org_name = parts[-2] if len(parts) > 3 else _DEFAULT_ORG
        if not _PATH_PART_RE.fullmatch(repo_name) or not _PATH_PART_RE.fullmatch(org_name):
            raise ValueError("Invalid repository URL path")
        return org_name, repo_name

    @staticmethod
    def _get_secure_repo_url(repo_url: str, access_token: Optional[str] = None) -> str:
        if not access_token:
            return repo_url
        scheme, rest = repo_url.split("://", 1)
        return f"{scheme}://{access_token}@{rest}"

    def _target_path(self, repo_url: str, branch: str) -> Path:
        # One checkout per branch, so branches of a repository can be indexed independently.
        org_name, repo_name = self._split_url(repo_url)
        return self.storage_dir / org_name / f"{repo_name}@{quote(branch, safe='')}"

    @staticmethod
    def list_remote_branches(repo_url: str, access_token: Optional[str] = None) -> Tuple[Optional[str], List[str]]:
        """(default_branch, branch names) of the remote, default first. Public repositories need no token.

        Raises ValueError for a malformed URL and RemoteError when the remote is unreachable or private/missing.
        """
        repo_url = normalize_repo_url(repo_url)
        if not _REPO_URL_RE.fullmatch(repo_url) or ".." in repo_url.split("/"):
            raise ValueError("Invalid repository URL: only http(s) URLs are supported")

        env = {**os.environ, "GIT_TERMINAL_PROMPT": "0", "GIT_ASKPASS": "true", "LC_ALL": "C"}
        if access_token:
            # Passed through the environment, not argv, so the token never shows up in `ps`.
            basic = base64.b64encode(f"x-access-token:{access_token}".encode()).decode()
            env.update(
                GIT_CONFIG_COUNT="1",
                GIT_CONFIG_KEY_0="http.extraHeader",
                GIT_CONFIG_VALUE_0=f"Authorization: Basic {basic}",
            )
        try:
            result = subprocess.run(
                ["git", "ls-remote", "--symref", "--", repo_url, "HEAD", "refs/heads/*"],
                capture_output=True, text=True, env=env, timeout=_LS_REMOTE_TIMEOUT_SECONDS,
            )
        except subprocess.TimeoutExpired:
            raise RemoteError("The repository host did not respond in time")
        except OSError:
            raise RemoteError("git is not available on the server")
        if result.returncode != 0:
            logger.info("ls-remote failed for %s: %s", repo_url, result.stderr.strip()[:200])
            raise RemoteError("Repository not found, private, or unreachable")

        default: Optional[str] = None
        branches: List[str] = []
        for line in result.stdout.splitlines():
            if line.startswith("ref: refs/heads/"):
                default = line.removeprefix("ref: refs/heads/").split("\t", 1)[0]
            elif "\trefs/heads/" in line:
                name = line.split("\trefs/heads/", 1)[1]
                if is_valid_git_ref(name):
                    branches.append(name)
        branches = sorted(set(branches), key=lambda b: (b != default, b.lower()))[:MAX_BRANCHES]
        if not branches:
            raise RemoteError("The repository has no branches")
        return (default if default in branches else branches[0]), branches

    def clone_or_pull_repository(
        self, repo_url: str, branch: str, access_token: Optional[str] = None
    ) -> Path:
        self.validate(repo_url, branch)
        target_path = self._target_path(repo_url, branch)
        secure_url = self._get_secure_repo_url(repo_url, access_token)

        try:
            if (target_path / ".git").exists():
                try:
                    repo = Repo(target_path)
                    origin = repo.remote(name="origin")
                    origin.set_url(secure_url)
                    origin.fetch()
                    repo.git.checkout(branch)
                    origin.pull(branch)
                    return target_path
                except Exception:
                    logger.warning("Pull/checkout failed for %s; re-cloning", repo_url, exc_info=True)
                    shutil.rmtree(target_path)

            target_path.mkdir(parents=True, exist_ok=True)
            Repo.clone_from(secure_url, target_path, branch=branch)
            logger.info("Ingested repository %s@%s", repo_url, branch)
            return target_path
        except GitCommandError as e:
            logger.error("Git operation failed for %s: %s", repo_url, e.stderr or e)
            raise RuntimeError("Failed to clone/pull repository") from e
        finally:
            # Never leave the access token persisted in .git/config.
            if access_token and (target_path / ".git").exists():
                try:
                    Repo(target_path).remote(name="origin").set_url(repo_url)
                except Exception:
                    logger.warning("Could not reset origin URL for %s", repo_url, exc_info=True)

    def cleanup_repository(self, repo_url: str, branch: str) -> bool:
        target_path = self._target_path(repo_url, branch)
        if target_path.exists():
            shutil.rmtree(target_path)
            return True
        return False
