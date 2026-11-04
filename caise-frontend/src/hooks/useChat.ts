import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError, api } from "../lib/api";
import { errorMessage } from "../lib/format";
import { streamChat } from "../lib/sse";
import type { ModelSelection, Source, StoredMessage } from "../lib/types";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  /** Assistant only */
  sources?: Source[];
  model?: ModelSelection;
  streaming?: boolean;
  error?: string;
  stopped?: boolean;
}

export interface SendOptions {
  selection: ModelSelection;
  repoId?: string;
  useContext: boolean;
  limit: number;
}

interface UseChatOptions {
  /** Active chat id (the `?chat=` URL param); null starts a new chat on the next send. */
  chatId: string | null;
  /** The server created a chat for the first message of a new conversation. */
  onChatCreated: (chatId: string) => void;
  /** A turn finished (answer, error or stop): the stored chat list changed. */
  onSettled: () => void;
}

let counter = 0;
const nextId = (): string => `m${Date.now().toString(36)}${(counter++).toString(36)}`;

const fromStored = (m: StoredMessage): ChatMessage => ({
  id: `s${m.id}`,
  role: m.role,
  content: m.content,
  ...(m.sources && { sources: m.sources }),
  ...(m.provider && m.model && { model: { provider: m.provider, model: m.model } }),
  ...(m.error && { error: m.error }),
  ...(m.stopped && { stopped: true }),
});

export function useChat({ chatId, onChatCreated, onSettled }: UseChatOptions) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  /** Repo scope of the chat that was last loaded from the server. */
  const [loadedChat, setLoadedChat] = useState<{ id: string; repoId: string | null } | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  /** Chat the on-screen messages belong to; sent as `chat_id` for follow-ups. */
  const activeChat = useRef<string | null>(null);
  /** Chat created by our own stream: it is already on screen, so the URL change must not reload it. */
  const ownChat = useRef<string | null>(null);
  const callbacks = useRef({ onChatCreated, onSettled });
  callbacks.current = { onChatCreated, onSettled };

  /** Detaches the in-flight stream (its updates are ignored from now on) and aborts it. */
  const detach = useCallback(() => {
    const running = abortRef.current;
    abortRef.current = null;
    running?.abort();
    setBusy(false);
  }, []);

  useEffect(() => detach, [detach]);

  // Load the stored chat whenever the URL points at one we are not already showing.
  useEffect(() => {
    if (chatId && chatId === ownChat.current) return;
    ownChat.current = null;
    detach();
    activeChat.current = chatId;
    setLoadError(null);
    setLoadedChat(null);
    if (!chatId) {
      setMessages([]);
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    setMessages([]);
    setLoading(true);
    api
      .chat(chatId, controller.signal)
      .then((chat) => {
        setMessages(chat.messages.map(fromStored));
        setLoadedChat({ id: chat.id, repoId: chat.repo_id });
      })
      .catch((e: unknown) => {
        if (!controller.signal.aborted) setLoadError(errorMessage(e));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [chatId, detach]);

  const patchLast = useCallback((fn: (m: ChatMessage) => ChatMessage) => {
    setMessages((all) => (all.length ? [...all.slice(0, -1), fn(all[all.length - 1]!)] : all));
  }, []);

  const send = useCallback(
    async (prompt: string, opts: SendOptions) => {
      const text = prompt.trim();
      if (!text || abortRef.current) return;

      const controller = new AbortController();
      abortRef.current = controller;
      const live = (): boolean => abortRef.current === controller;
      setBusy(true);
      setMessages((all) => [
        ...all,
        { id: nextId(), role: "user", content: text },
        { id: nextId(), role: "assistant", content: "", streaming: true, model: opts.selection },
      ]);

      // Tokens arrive far faster than the screen refreshes: buffer them and flush once per frame.
      let pending = "";
      let frame = 0;
      const flush = () => {
        frame = 0;
        if (!pending || !live()) return;
        const chunk = pending;
        pending = "";
        patchLast((m) => ({ ...m, content: m.content + chunk }));
      };
      const schedule = () => {
        if (!frame) frame = requestAnimationFrame(flush);
      };
      const settleBuffer = () => {
        if (frame) cancelAnimationFrame(frame);
        flush();
      };

      try {
        const events = streamChat(
          {
            prompt: text,
            provider: opts.selection.provider,
            model: opts.selection.model,
            repo_id: opts.repoId,
            chat_id: activeChat.current ?? undefined,
            use_context: opts.useContext,
            limit: opts.limit,
          },
          { signal: controller.signal },
        );
        for await (const event of events) {
          if (!live()) break;
          if (event.type === "chat") {
            activeChat.current = event.chat_id;
            ownChat.current = event.chat_id;
            callbacks.current.onChatCreated(event.chat_id);
          } else if (event.type === "sources") patchLast((m) => ({ ...m, sources: event.sources }));
          else if (event.type === "token") {
            pending += event.text;
            schedule();
          } else if (event.type === "error") {
            settleBuffer();
            patchLast((m) => ({ ...m, error: event.message }));
          }
        }
        settleBuffer();
        if (live()) patchLast((m) => ({ ...m, streaming: false }));
      } catch (e) {
        settleBuffer();
        if (live()) {
          if (controller.signal.aborted) {
            patchLast((m) => ({ ...m, streaming: false, stopped: true }));
          } else {
            const message = e instanceof ApiError ? e.message : errorMessage(e);
            patchLast((m) => ({ ...m, streaming: false, error: message }));
          }
        }
      } finally {
        if (frame) cancelAnimationFrame(frame);
        if (live()) {
          abortRef.current = null;
          setBusy(false);
        }
        callbacks.current.onSettled();
      }
    },
    [patchLast],
  );

  const stop = useCallback(() => abortRef.current?.abort(), []);

  /** Drops the conversation from the screen; the caller clears `?chat`. */
  const reset = useCallback(() => {
    detach();
    activeChat.current = null;
    ownChat.current = null;
    setMessages([]);
    setLoadedChat(null);
    setLoadError(null);
    setLoading(false);
  }, [detach]);

  return { messages, busy, loading, loadError, loadedChat, send, stop, reset };
}
