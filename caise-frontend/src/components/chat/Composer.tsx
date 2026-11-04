import { ArrowUp, Square } from "lucide-react";
import { useEffect, useRef, useState, type KeyboardEvent } from "react";

interface ComposerProps {
  busy: boolean;
  disabled?: boolean;
  placeholder: string;
  onSend: (text: string) => void;
  onStop: () => void;
}

const MAX_HEIGHT_PX = 200;

export function Composer({ busy, disabled, placeholder, onSend, onStop }: ComposerProps) {
  const [text, setText] = useState("");
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, MAX_HEIGHT_PX)}px`;
  }, [text]);

  const submit = () => {
    if (!text.trim() || busy || disabled) return;
    onSend(text);
    setText("");
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    // Enter sends, Shift+Enter inserts a newline; ignore Enter while an IME is composing.
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      submit();
    }
  };

  return (
    <div className="border-t border-line bg-canvas px-6 py-4">
      <div className="mx-auto flex max-w-3xl items-end gap-2 rounded-2xl border border-line bg-surface p-2 shadow-sm focus-within:border-stone-400">
        <textarea
          id="composer"
          ref={ref}
          value={text}
          rows={1}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={placeholder}
          aria-label="Message"
          style={{ maxHeight: `${MAX_HEIGHT_PX}px`, border: "none", resize: "none", outline: "none" }}
          className="max-h-[200px] flex-1 resize-none bg-transparent px-2 py-2 text-[15px] outline-none placeholder:text-faint focus-visible:outline-none"
        />
        {busy ? (
          <button
            type="button"
            onClick={onStop}
            aria-label="Stop generating"
            title="Stop generating"
            className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-ink text-white hover:bg-stone-700"
          >
            <Square className="size-3.5 fill-current" />
          </button>
        ) : (
          <button
            type="button"
            onClick={submit}
            disabled={disabled || !text.trim()}
            aria-label="Send message"
            title="Send"
            className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-ink text-white transition-colors hover:bg-stone-700 disabled:bg-stone-200 disabled:text-stone-400"
          >
            <ArrowUp className="size-4" />
          </button>
        )}
      </div>
      <p className="mx-auto mt-2 max-w-3xl text-center text-[11px] text-faint">
        Enter to send · Shift+Enter for a new line
      </p>
    </div>
  );
}
