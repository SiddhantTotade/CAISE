import { API_PREFIX } from "./config";
import type {
  BranchesRequest,
  BranchesResponse,
  ChatSummary,
  IndexRequest,
  IndexResponse,
  ModelCatalog,
  ProviderId,
  Repo,
  RepoFiles,
  StoredChat,
  StoredKey,
  TaskStatus,
  User,
} from "./types";

/** Error carrying the backend's `{code, message}` detail (or a best-effort fallback). */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

export async function toApiError(res: Response): Promise<ApiError> {
  let code = "http_error";
  let message = `Request failed (${res.status})`;
  try {
    const body: unknown = await res.json();
    const detail = (body as { detail?: unknown }).detail;
    if (typeof detail === "string") {
      message = detail;
    } else if (detail && typeof detail === "object") {
      const d = detail as { code?: string; message?: string };
      code = d.code ?? code;
      message = d.message ?? message;
    } else if (Array.isArray(detail)) {
      message = "The request was not valid";
      code = "invalid_request";
    }
  } catch {
    /* non-JSON body: keep the fallback */
  }
  return new ApiError(res.status, code, message);
}

export const url = (path: string): string => `${API_PREFIX}${path}`;

type UnauthorizedHandler = () => void;
let onUnauthorized: UnauthorizedHandler | null = null;
export function setUnauthorizedHandler(handler: UnauthorizedHandler | null): void {
  onUnauthorized = handler;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url(path), {
    credentials: "include",
    ...init,
    headers: { Accept: "application/json", ...(init?.headers ?? {}) },
  });
  if (!res.ok) {
    if (res.status === 401) onUnauthorized?.();
    throw await toApiError(res);
  }
  return (await res.json()) as T;
}

const json = (body: unknown, method = "POST", signal?: AbortSignal): RequestInit => ({
  method,
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
  signal,
});

export const api = {
  /** Resolves null when signed out, so callers can treat that as state rather than an error. */
  async me(): Promise<User | null> {
    const res = await fetch(url("/auth/me"), { credentials: "include" });
    if (res.status === 401) return null;
    if (!res.ok) throw await toApiError(res);
    return (await res.json()) as User;
  },
  guest: () => request<User>("/auth/guest", { method: "POST" }),
  logout: () => request<{ status: string }>("/auth/logout", { method: "POST" }),
  loginUrl: (): string => url("/auth/github"),

  models: () => request<ModelCatalog>("/models"),

  keys: () => request<{ keys: StoredKey[] }>("/me/keys").then((r) => r.keys),
  saveKey: (provider: ProviderId, apiKey: string) =>
    request<StoredKey>(`/me/keys/${encodeURIComponent(provider)}`, json({ api_key: apiKey }, "PUT")),
  deleteKey: (provider: ProviderId) =>
    request<{ status: string }>(`/me/keys/${encodeURIComponent(provider)}`, { method: "DELETE" }),

  repos: () => request<Repo[]>("/repos"),
  branches: (body: BranchesRequest, signal?: AbortSignal) =>
    request<BranchesResponse>("/repos/branches", json(body, "POST", signal)),
  repoFiles: (repoId: string, signal?: AbortSignal) =>
    request<RepoFiles>(`/repos/files?repo_id=${encodeURIComponent(repoId)}`, { signal }),
  indexRepo: (body: IndexRequest) => request<IndexResponse>("/index-repo-async", json(body)),
  taskStatus: (taskId: string) => request<TaskStatus>(`/task-status/${encodeURIComponent(taskId)}`),
  deleteRepo: (repoId: string) =>
    request<{ status: string }>(`/repos?repo_id=${encodeURIComponent(repoId)}`, { method: "DELETE" }),

  chats: () => request<{ chats: ChatSummary[] }>("/chats").then((r) => r.chats),
  chat: (chatId: string, signal?: AbortSignal) =>
    request<StoredChat>(`/chats/${encodeURIComponent(chatId)}`, { signal }),
  deleteChat: (chatId: string) =>
    request<{ status: string }>(`/chats/${encodeURIComponent(chatId)}`, { method: "DELETE" }),
};
