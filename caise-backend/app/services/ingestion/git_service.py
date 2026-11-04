import re
import subprocess
from typing import List, Tuple

_GIT_REF_RE = re.compile(r"^[A-Za-z0-9_][A-Za-z0-9_./~^@-]*$")
_GIT_TIMEOUT_SECONDS = 60


def is_valid_git_ref(ref: str) -> bool:
    """Allow-list validation for a commit/branch/tag reference.

    Rejects a leading '-' (option injection), '..' (range/traversal), and any character
    outside the allow-list, so shell metacharacters and whitespace never reach git.
    """
    if not ref or not isinstance(ref, str):
        return False
    if ".." in ref or ref.endswith(".lock"):
        return False
    return bool(_GIT_REF_RE.fullmatch(ref))


def get_file_diff(repo_path: str, old_commit: str, new_commit: str) -> Tuple[List[str], List[str], List[str]]:
    """Return (modified, added, deleted) file paths between two commits.

    Renames are reported as a deletion of the old path plus an addition of the new path.
    """
    if not is_valid_git_ref(old_commit) or not is_valid_git_ref(new_commit):
        raise ValueError("Invalid commit or branch reference format detected.")

    # Revisions precede '--'; everything after it is a pathspec, so revisions can never be parsed as options.
    cmd = ["git", "-C", str(repo_path), "diff", "--name-status", "-z", old_commit, new_commit, "--"]

    try:
        result = subprocess.run(
            cmd, capture_output=True, text=True, check=True, timeout=_GIT_TIMEOUT_SECONDS
        )
    except subprocess.CalledProcessError as e:
        raise ValueError(
            f"Git diff failed. Ensure commits exist in the repository. Details: {e.stderr.strip()}"
        ) from e

    modified: List[str] = []
    added: List[str] = []
    deleted: List[str] = []

    # -z output: STATUS NUL PATH NUL, or STATUS NUL OLD NUL NEW NUL for renames/copies.
    fields = result.stdout.split("\0")
    i = 0
    while i < len(fields) and fields[i]:
        status = fields[i]
        if status[0] in ("R", "C"):
            old_path, new_path = fields[i + 1], fields[i + 2]
            i += 3
            if status[0] == "R":
                deleted.append(old_path)
            added.append(new_path)
            continue
        path = fields[i + 1]
        i += 2
        if status[0] in ("M", "T"):
            modified.append(path)
        elif status[0] == "A":
            added.append(path)
        elif status[0] == "D":
            deleted.append(path)

    return modified, added, deleted
