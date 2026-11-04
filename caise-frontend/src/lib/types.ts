/** Shapes returned by / sent to the CAISE backend (see caise-backend/app/api/v1). */

export interface Organization {
  id: string;
  name: string;
}

export interface User {
  id: string;
  username: string;
  email: string | null;
  avatar_url: string | null;
  organizations: Organization[];
  is_guest: boolean;
}

export type IndexMode = "full" | "incremental" | "unchanged";

export interface RepoChanges {
  mode: IndexMode;
  modified: string[];
  added: string[];
  deleted: string[];
}

export interface Repo {
  repo_id: string;
  repo_url: string;
  branch: string;
  status: "pending" | "indexing" | "indexed" | "failed";
  last_index_commit: string | null;
  updated_at: string | null;
  changes: RepoChanges | null;
  is_owner: boolean;
}

export interface IndexRequest {
  repo_url: string;
  branch: string;
  access_token?: string;
}

export interface IndexResponse {
  status: string;
  message: string;
  task_id: string;
  repo_id: string;
}

export interface BranchesRequest {
  repo_url: string;
  access_token?: string;
}

export interface BranchInfo {
  name: string;
  indexed: boolean;
  repo_id: string | null;
}

export interface BranchesResponse {
  repo_url: string;
  default_branch: string | null;
  branches: BranchInfo[];
  /** Set when the remote could not be reached and only already-indexed branches are listed. */
  remote_error: string | null;
}

export interface RepoFile {
  path: string;
  chunks: number;
}

export interface RepoFiles {
  repo_id: string;
  total: number;
  files: RepoFile[];
}

export interface TaskStatus {
  task_id: string;
  status: "PENDING" | "STARTED" | "RETRY" | "SUCCESS" | "FAILURE" | string;
  result: { status: "success" | "error"; error?: string } | null;
}

export type ProviderId = "ollama" | "openai" | "anthropic" | "deepseek";

export interface ProviderInfo {
  id: ProviderId;
  type: "local" | "cloud";
  configured: boolean;
  /** Cloud providers only: the signed-in user saved their own key. */
  has_user_key: boolean;
  default_model: string;
  models: string[];
}

export interface ModelCatalog {
  default_provider: ProviderId;
  providers: ProviderInfo[];
}

export interface ModelSelection {
  provider: ProviderId;
  model: string;
}

export interface Source {
  repo_id: string;
  file_path: string;
  start_line: number;
  end_line: number;
  score: number;
}

export type ChatRole = "user" | "assistant";

export interface ChatRequest {
  prompt: string;
  provider: ProviderId;
  model: string;
  repo_id?: string;
  chat_id?: string;
  use_context: boolean;
  limit: number;
}

export interface ChatSummary {
  id: string;
  title: string;
  repo_id: string | null;
  created_at: string;
  updated_at: string;
  message_count: number;
}

export interface StoredMessage {
  id: number;
  role: ChatRole;
  content: string;
  sources: Source[] | null;
  provider: ProviderId | null;
  model: string | null;
  error: string | null;
  stopped: boolean;
  created_at: string;
}

export interface StoredChat extends Omit<ChatSummary, "message_count"> {
  messages: StoredMessage[];
}

export interface StoredKey {
  provider: ProviderId;
  hint: string;
  updated_at: string;
}

export type ChatEvent =
  | { type: "chat"; chat_id: string; title: string }
  | { type: "start"; provider: ProviderId; model: string }
  | { type: "sources"; sources: Source[] }
  | { type: "token"; text: string }
  | { type: "done"; provider: ProviderId; model: string }
  | { type: "error"; code: string; message: string };
