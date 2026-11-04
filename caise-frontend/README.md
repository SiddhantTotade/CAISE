# CAISE frontend

React 19 + Vite + TypeScript (strict) + Tailwind CSS 4. Talks to the CAISE FastAPI backend over `/api/v1`
with cookie auth and Server-Sent Events for streaming chat.

## Run

```bash
cp .env.example .env      # backend URL, dev port, API prefix
npm install
npm run dev               # http://localhost:3000
npm run build             # typecheck + production bundle in dist/
```

The dev/preview server proxies `/api` to `VITE_BACKEND_URL`, so the HttpOnly session cookie stays same-origin.
Backend `.env` must have `FRONTEND_URL` equal to the dev origin (default `http://localhost:3000`).
A production deployment should serve the bundle and `/api` from one origin (reverse proxy).

## Layout

```
src/
  lib/         api client, SSE parser, types, settings storage, formatting, highlight.js setup
  context/     AuthContext (session, guest sign-in), SettingsContext (preferences only)
  hooks/       useModels, useRepos (+ indexing job polling), useRemoteBranches, useChat (streaming), useChats (stored chat list)
  components/
    layout/    AppLayout, TopBar, Sidebar, MobileNav, RequireAuth, Logo
    dashboard/ RepoCard, JobCard, AddRepoDialog
    chat/      MessageList, Composer, ModelSelector, Markdown, CodeBlock, TreeView
    workspace/ ContextDrawer (files analyzed + M/A/D changes)
    settings/  Tabs, ApiKeyField
    ui/        Button, StatusBadge/ChangeBadge, Feedback, GithubIcon
  pages/       LoginPage, DashboardPage, WorkspacePage, SettingsPage
```

## Notes

- Provider API keys are saved per account on the server (encrypted, never returned in full) via `/me/keys`;
  nothing key-related is stored in the browser. Guests have no Settings page and cannot save keys.
- "Continue without signing in" starts a guest session: public github.com repositories only, own chats only.
- Repositories are indexed per branch; the repo id is `<url>@<branch>`. Branches come from `POST /repos/branches`.
- Chats are stored on the server. The client sends only `chat_id`; the server rebuilds history from the last
  20 stored messages and omits failed turns.
