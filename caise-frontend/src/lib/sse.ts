import { ApiError, toApiError, url } from "./api";
import type { ChatEvent, ChatRequest } from "./types";

interface StreamOptions {
  signal: AbortSignal;
}

/** Parses one SSE block (`event:` + `data:` lines) into a typed event, or null for unknown/keep-alive blocks. */
function parseBlock(block: string): ChatEvent | null {
  let name = "";
  const data: string[] = [];
  for (const line of block.split("\n")) {
    if (line.startsWith("event:")) name = line.slice(6).trim();
    else if (line.startsWith("data:")) data.push(line.slice(5).replace(/^ /, ""));
  }
  if (!name || data.length === 0) return null;
  const payload = JSON.parse(data.join("\n")) as Record<string, unknown>;
  switch (name) {
    case "chat":
      return { type: "chat", chat_id: String(payload.chat_id), title: String(payload.title ?? "") };
    case "start":
    case "done":
      return { type: name, provider: payload.provider, model: payload.model } as ChatEvent;
    case "sources":
      return { type: "sources", sources: payload.sources } as ChatEvent;
    case "token":
      return { type: "token", text: String(payload.text ?? "") };
    case "error":
      return { type: "error", code: String(payload.code), message: String(payload.message) };
    default:
      return null;
  }
}

/**
 * POSTs a chat request and yields events as they arrive.
 * Pre-stream failures (bad model, missing key, timeout) throw ApiError; later failures arrive as an `error` event.
 */
export async function* streamChat(
  body: ChatRequest,
  { signal }: StreamOptions,
): AsyncGenerator<ChatEvent, void, void> {
  const res = await fetch(url("/chat/stream"), {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
    body: JSON.stringify(body),
    signal,
  });
  if (!res.ok) throw await toApiError(res);
  if (!res.body) throw new ApiError(502, "no_stream", "The server returned no stream");

  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = "";
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += value.replace(/\r\n/g, "\n");
      let sep: number;
      while ((sep = buffer.indexOf("\n\n")) !== -1) {
        const event = parseBlock(buffer.slice(0, sep));
        buffer = buffer.slice(sep + 2);
        if (event) yield event;
      }
    }
  } finally {
    // Cancelling closes the connection, which makes the backend close the upstream provider stream.
    await reader.cancel().catch(() => undefined);
  }
}
