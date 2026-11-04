import { FileCode, Sparkles, TriangleAlert } from "lucide-react";
import { memo, useEffect, useRef } from "react";
import type { ChatMessage } from "../../hooks/useChat";
import { basename } from "../../lib/format";
import { Markdown } from "./Markdown";

const STICK_THRESHOLD_PX = 120;

function Sources({ message }: { message: ChatMessage }) {
  if (!message.sources?.length) return null;
  return (
    <div className="mt-4 flex flex-wrap gap-1.5">
      {message.sources.map((s, i) => (
        <span
          key={`${s.file_path}-${s.start_line}-${i}`}
          title={`${s.repo_id}\n${s.file_path}:${s.start_line}-${s.end_line}`}
          className="inline-flex max-w-full items-center gap-1.5 rounded-md border border-line bg-surface px-2 py-1 font-mono text-[11px] text-muted"
        >
          <FileCode className="size-3 shrink-0" />
          <span className="truncate">
            {basename(s.file_path)}:{s.start_line}-{s.end_line}
          </span>
        </span>
      ))}
    </div>
  );
}

const Assistant = memo(function Assistant({ message }: { message: ChatMessage }) {
  const waiting = message.streaming && !message.content;
  return (
    <div className="flex gap-4">
      <div className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-ink text-white">
        <Sparkles className="size-3.5" />
      </div>
      <div className="min-w-0 flex-1 text-[15px]">
        {message.model && (
          <div className="mb-1 font-mono text-[11px] text-faint">
            {message.model.provider} · {message.model.model}
          </div>
        )}
        {waiting ? (
          <p className="caret my-3 text-muted">Thinking</p>
        ) : (
          <div className={message.streaming ? "caret" : undefined}>
            <Markdown streaming={message.streaming}>{message.content}</Markdown>
          </div>
        )}
        {message.stopped && <p className="mt-2 text-xs text-faint">Stopped</p>}
        {message.error && (
          <div role="alert" className="mt-3 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
            <TriangleAlert className="mt-0.5 size-4 shrink-0" />
            <span className="break-words">{message.error}</span>
          </div>
        )}
        <Sources message={message} />
      </div>
    </div>
  );
});

const User = memo(function User({ message }: { message: ChatMessage }) {
  return (
    <div className="flex justify-end">
      <div className="max-w-[85%] whitespace-pre-wrap break-words rounded-2xl bg-stone-100 px-4 py-2.5 text-[15px] leading-7">
        {message.content}
      </div>
    </div>
  );
});

export function MessageList({ messages }: { messages: ChatMessage[] }) {
  const scroller = useRef<HTMLDivElement>(null);
  const stuck = useRef(true);

  // Follow the stream only while the reader is near the bottom; scrolling up releases the lock.
  // Scrolling is coalesced to one write per frame so it never forces layout more than once per paint.
  const frame = useRef(0);
  useEffect(() => {
    if (!stuck.current || frame.current) return;
    frame.current = requestAnimationFrame(() => {
      frame.current = 0;
      const el = scroller.current;
      if (el && stuck.current) el.scrollTop = el.scrollHeight;
    });
  }, [messages]);
  useEffect(() => () => cancelAnimationFrame(frame.current), []);

  const onScroll = () => {
    const el = scroller.current;
    if (el) stuck.current = el.scrollHeight - el.scrollTop - el.clientHeight < STICK_THRESHOLD_PX;
  };

  return (
    <div ref={scroller} onScroll={onScroll} className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto max-w-3xl space-y-8 px-6 py-8">
        {messages.map((m) => (m.role === "user" ? <User key={m.id} message={m} /> : <Assistant key={m.id} message={m} />))}
      </div>
    </div>
  );
}
