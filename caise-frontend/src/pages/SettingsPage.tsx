import { Cpu, KeyRound, ShieldCheck, SlidersHorizontal } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { ApiKeyField } from "../components/settings/ApiKeyField";
import { Row, Tabs, Toggle, type TabDef } from "../components/settings/Tabs";
import { Button } from "../components/ui/Button";
import { ErrorNotice, Spinner } from "../components/ui/Feedback";
import { api } from "../lib/api";
import { errorMessage } from "../lib/format";
import type { StoredKey } from "../lib/types";
import { useAuth } from "../context/AuthContext";
import { useSettings } from "../context/SettingsContext";
import { useModels } from "../hooks/useModels";
import { CLOUD_PROVIDERS, DEFAULT_PREFERENCES, type CloudProvider } from "../lib/settings";
import { Dropdown, type DropdownGroup } from "../components/ui/Dropdown";

type TabId = "workspace" | "models" | "keys" | "security";

const TABS: TabDef<TabId>[] = [
  { id: "workspace", label: "Workspace", icon: SlidersHorizontal },
  { id: "models", label: "Models", icon: Cpu },
  { id: "keys", label: "API keys", icon: KeyRound },
  { id: "security", label: "Security", icon: ShieldCheck },
];

const CLOUD_LABELS: Record<CloudProvider, string> = { openai: "OpenAI", anthropic: "Anthropic", deepseek: "DeepSeek" };

const SNIPPET_GROUPS: DropdownGroup[] = [
  { id: "snippets", options: [3, 5, 8, 12, 20].map((n) => ({ value: String(n), label: String(n) })) },
];


function WorkspaceTab() {
  const { prefs, updatePrefs } = useSettings();
  return (
    <div className="divide-y divide-line">
      <Row title="Use code context" description="Retrieve relevant snippets from indexed repositories to ground each answer.">
        <Toggle label="Use code context" checked={prefs.useContext} onChange={(v) => updatePrefs({ useContext: v })} />
      </Row>
      <Row title="Snippets per question" description="How many code snippets are retrieved for each question.">
        <Dropdown
          ariaLabel="Snippets per question"
          value={String(prefs.contextSnippets)}
          disabled={!prefs.useContext}
          groups={SNIPPET_GROUPS}
          onChange={(v) => updatePrefs({ contextSnippets: Number(v) })}
          align="end"
          className="w-24"
        />
      </Row>
      <Row title="Context panel" description="Show the files analyzed and recent changes next to the chat.">
        <Toggle label="Show context panel" checked={prefs.openContextDrawer} onChange={(v) => updatePrefs({ openContextDrawer: v })} />
      </Row>
      <Row title="Reset preferences" description="Restore these workspace options to their defaults.">
        <Button size="sm" onClick={() => updatePrefs({ ...DEFAULT_PREFERENCES, model: prefs.model })}>Reset</Button>
      </Row>
    </div>
  );
}

function ModelsTab() {
  const { catalog, loading, error, selection, select: choose, reload } = useModels();

  if (loading) return <div className="flex justify-center py-16 text-muted"><Spinner className="size-6" /></div>;
  if (error || !catalog) {
    return (
      <div className="space-y-3 py-5">
        <ErrorNotice>Could not load models{error ? `: ${error}` : ""}</ErrorNotice>
        <Button size="sm" onClick={reload}>Retry</Button>
      </div>
    );
  }

  return (
    <div className="divide-y divide-line">
      {catalog.providers.map((p) => {
        const usable = p.configured;
        const current = selection?.provider === p.id ? selection.model : p.default_model;
        return (
          <Row
            key={p.id}
            title={p.type === "local" ? "Local · Ollama" : CLOUD_LABELS[p.id as CloudProvider]}
            description={
              p.type === "local"
                ? "Runs on the machine hosting the backend. Pick which local model is active."
                : usable
                  ? "Ready to use."
                  : "Add an API key to enable this provider."
            }
          >
            <div className="flex items-center gap-2">
              <Dropdown
                ariaLabel={`${p.id} model`}
                value={current}
                disabled={!usable}
                groups={[{ id: p.id, options: p.models.map((m) => ({ value: m, label: m })) }]}
                onChange={(m) => choose({ provider: p.id, model: m })}
                align="end"
                className="w-56"
              />
              <Button size="sm" disabled={!usable || (selection?.provider === p.id && selection.model === current)} onClick={() => choose({ provider: p.id, model: current })}>
                {selection?.provider === p.id ? "Active" : "Use"}
              </Button>
            </div>
          </Row>
        );
      })}
    </div>
  );
}

function KeysTab() {
  const { catalog, reload: reloadModels } = useModels();
  const [keys, setKeys] = useState<StoredKey[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setKeys(await api.keys());
      setError(null);
    } catch (e) {
      setError(errorMessage(e));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // A changed key changes which providers are usable, so refresh the model catalog too.
  const save = async (provider: CloudProvider, key: string) => {
    await api.saveKey(provider, key);
    await load();
    reloadModels();
  };
  const remove = async (provider: CloudProvider) => {
    await api.deleteKey(provider);
    await load();
    reloadModels();
  };

  return (
    <div>
      <p className="py-5 text-sm leading-6 text-muted">
        Keys are stored encrypted on the server for your account and never in the browser. Once saved, a key can only be
        replaced or removed, not viewed. A key saved here is used for your requests in place of any server-wide key.
      </p>
      {error && <ErrorNotice className="mb-3">{error}</ErrorNotice>}
      {keys === null && !error ? (
        <div className="flex justify-center border-t border-line py-12 text-muted"><Spinner className="size-6" /></div>
      ) : (
        <div className="divide-y divide-line border-t border-line">
          {CLOUD_PROVIDERS.map((p) => (
            <ApiKeyField
              key={p}
              label={CLOUD_LABELS[p]}
              info={catalog?.providers.find((i) => i.id === p)}
              saved={keys?.find((k) => k.provider === p)}
              onSave={(k) => save(p, k)}
              onRemove={() => remove(p)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function SecurityTab() {
  const { user, signOut } = useAuth();
  return (
    <div className="divide-y divide-line">
      <Row title="Signed in as" description={user?.email ?? "GitHub account"}>
        <span className="text-sm font-medium">{user?.username}</span>
      </Row>
      <Row title="Organizations" description="Synced from GitHub when you sign in.">
        <span className="text-sm text-muted">
          {user?.organizations.length ? user.organizations.map((o) => o.name).join(", ") : "None"}
        </span>
      </Row>
      <Row title="Session" description="Authentication uses an HttpOnly cookie that scripts cannot read.">
        <Button size="sm" onClick={() => void signOut()}>Sign out</Button>
      </Row>
    </div>
  );
}

export function SettingsPage() {
  const [tab, setTab] = useState<TabId>("workspace");
  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-3xl px-6 py-10">
        <h1 className="text-xl font-semibold tracking-tight">Settings</h1>
        <p className="mt-1 mb-8 text-sm text-muted">Workspace preferences, models and provider keys.</p>
        <Tabs tabs={TABS} active={tab} onChange={setTab} />
        <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`}>
          {tab === "workspace" && <WorkspaceTab />}
          {tab === "models" && <ModelsTab />}
          {tab === "keys" && <KeysTab />}
          {tab === "security" && <SecurityTab />}
        </div>
      </div>
    </div>
  );
}
