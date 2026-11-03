import os
import shutil
from pathlib import Path
from git import Repo, GitCommandError
from app.core.config import settings

class GitIngestionService:
    def __init__(self):
        self.storage_dir = settings.STORAGE_DIR

    def _get_secure_repo_url(self, repo_url: str, access_token: str = None) -> str:
        if not access_token:
            return repo_url

        if repo_url.startswith("https://"):
            clean_url = repo_url.replace("https://", "")
            return f"https://{access_token}@{clean_url}"
        elif repo_url.startswith("http://"):
            clean_url = repo_url.replace("http://", "")
            return f"http://{access_token}@{clean_url}"

        return repo_url

    def clone_or_pull_repository(self, repo_url: str, branch: str = "main", access_token:str = None) -> Path:
        repo_name = repo_url.strip("/").split("/")[-1].replace(".git", "")
        org_name = repo_url.rstrip("/").split("/")[-2] if len(repo_url.split("/")) >= 2 else "defalut"

        target_path = self.storage_dir / org_name / repo_name
        target_path.mkdir(parents=True, exist_ok=True)

        secure_url = self._get_secure_repo_url(repo_url, access_token)

        try:
            if(target_path / ".git").exists():
                print("Repository already exists")
                try:
                    repo = Repo(target_path)

                    origin = repo.remote(name = "origin")
                    origin.set_url(secure_url)

                    origin.fetch()
                    repo.git.checkout(branch)
                    origin.pull(name=branch)
                except Exception as pull_err:
                    print("Pull/Checkout failed ({pull_err}). Re-cloning fresh...")
                    shutil.rmtree(target_path)
                    target_path.mkdir(parents=True, exist_ok=True)
                    Repo.clone_from(secure_url, target_path, branch=branch)
            else:
                print("Cloning repository...")
                Repo.clone_from(secure_url, target_path, branch=branch)

            print("Successfully ingested repository")
            return target_path
        
        except GitCommandError as e:
            print("Git operation failed : {e}")
            raise RuntimeError("Failed to clone/pull repository")
        except Exception as e:
            print("Unexpected error during ingestion")
            raise

    def cleanup_repository(self, repo_url: str) -> bool:
        repo_name = repo_url.rstrip("/").split("/")[-1].replace(".git", "")
        org_name = repo_url.rstrip("/").split("/")[-2] if len(repo_url.split("/")) >= 2 else "default"

        target_path = self.storage_dir / org_name / repo_name

        if target_path.exists():
            shutil.rmtree(target_path)
            return True

        return False