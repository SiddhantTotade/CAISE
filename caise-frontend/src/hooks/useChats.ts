import { useCallback, useEffect, useState } from "react";
import { api } from "../lib/api";
import { errorMessage } from "../lib/format";
import type { ChatSummary } from "../lib/types";

export interface UseChats {
  chats: ChatSummary[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  remove: (chatId: string) => Promise<void>;
}

/** The signed-in user's persisted chats, newest first. Shared via AppLayout's outlet context. */
export function useChats(): UseChats {
  const [chats, setChats] = useState<ChatSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setChats(await api.chats());
      setError(null);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const remove = useCallback(
    async (chatId: string) => {
      await api.deleteChat(chatId);
      setChats((all) => all.filter((c) => c.id !== chatId));
    },
    [],
  );

  return { chats, loading, error, refresh, remove };
}
