import { Cloud, Cpu } from "lucide-react";
import { useMemo } from "react";
import type { ModelCatalog, ModelSelection, ProviderId } from "../../lib/types";
import { Dropdown, type DropdownGroup } from "../ui/Dropdown";

export const PROVIDER_LABELS: Record<ProviderId, string> = {
  ollama: "Local · Ollama",
  openai: "OpenAI",
  anthropic: "Anthropic",
  deepseek: "DeepSeek",
};

const SEP = "|"; // provider ids never contain it; model names may contain ":" or "/"

interface ModelSelectorProps {
  catalog: ModelCatalog | null;
  loading: boolean;
  selection: ModelSelection | null;
  onSelect: (selection: ModelSelection) => void;
  disabled?: boolean;
}

export function ModelSelector({ catalog, loading, selection, onSelect, disabled }: ModelSelectorProps) {
  const groups = useMemo<DropdownGroup[]>(
    () =>
      (catalog?.providers ?? []).map((p) => {
        const Icon = p.type === "local" ? Cpu : Cloud;
        return {
          id: p.id,
          label: (
            <>
              <Icon className="size-3" /> {PROVIDER_LABELS[p.id]}
            </>
          ),
          options: p.models.map((model) => ({
            value: `${p.id}${SEP}${model}`,
            label: model,
            disabled: !p.configured,
          })),
        };
      }),
    [catalog],
  );

  const current = catalog?.providers.find((p) => p.id === selection?.provider);
  const Icon = current?.type === "local" ? Cpu : Cloud;

  return (
    <Dropdown
      ariaLabel="Model"
      placeholder="Select model"
      value={selection ? `${selection.provider}${SEP}${selection.model}` : null}
      groups={groups}
      icon={<Icon />}
      loading={loading}
      disabled={disabled || !catalog}
      className="max-w-[18rem]"
      onChange={(v) => {
        const at = v.indexOf(SEP);
        onSelect({ provider: v.slice(0, at) as ProviderId, model: v.slice(at + 1) });
      }}
    />
  );
}
