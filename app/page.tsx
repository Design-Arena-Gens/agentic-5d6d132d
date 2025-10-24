"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type Role = "system" | "user" | "assistant";

export type ChatMessage = {
  id: string;
  role: Role;
  content: string;
  createdAt: number;
};

const DEFAULT_SYSTEM_PROMPT = "You are a helpful AI assistant.";

function useLocalStorage<T>(key: string, initial: T) {
  const [value, setValue] = useState<T>(() => {
    if (typeof window === "undefined") return initial;
    try {
      const raw = window.localStorage.getItem(key);
      return raw ? (JSON.parse(raw) as T) : initial;
    } catch {
      return initial;
    }
  });
  useEffect(() => {
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
    } catch {}
  }, [key, value]);
  return [value, setValue] as const;
}

function uuid() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export default function Page() {
  const [messages, setMessages] = useLocalStorage<ChatMessage[]>(
    "owui.messages",
    []
  );
  const [systemPrompt, setSystemPrompt] = useLocalStorage(
    "owui.systemPrompt",
    DEFAULT_SYSTEM_PROMPT
  );
  const [apiKey, setApiKey] = useLocalStorage<string | "">("owui.apiKey", "");
  const [model, setModel] = useLocalStorage("owui.model", "gpt-4o-mini");
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [temperature, setTemperature] = useLocalStorage("owui.temp", 0.7);
  const [baseUrl, setBaseUrl] = useLocalStorage("owui.baseUrl", "/api/openai");

  const inputRef = useRef<HTMLTextAreaElement>(null);

  const canSend = useMemo(
    () => !!input.trim() && !isStreaming && (!!apiKey || baseUrl.startsWith("/api")),
    [input, isStreaming, apiKey, baseUrl]
  );

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
        e.preventDefault();
        onSend();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [input, isStreaming, apiKey, baseUrl, messages]);

  async function onSend() {
    if (!canSend) return;
    const newUser: ChatMessage = {
      id: uuid(),
      role: "user",
      content: input.trim(),
      createdAt: Date.now(),
    };
    const history = [
      { id: uuid(), role: "system" as const, content: systemPrompt, createdAt: Date.now() },
      ...messages,
      newUser,
    ];

    setInput("");
    const draftAssistant: ChatMessage = {
      id: uuid(),
      role: "assistant",
      content: "",
      createdAt: Date.now(),
    };
    setMessages([...messages, newUser, draftAssistant]);

    try {
      setIsStreaming(true);
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          apiKey: apiKey || undefined,
          baseUrl: baseUrl || undefined,
          model,
          temperature,
          messages: history.map(({ role, content }) => ({ role, content })),
        }),
      });
      if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let acc = "";

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        acc += decoder.decode(value, { stream: true });
        setMessages((prev) => prev.map((m) => (m.id === draftAssistant.id ? { ...m, content: acc } : m)));
      }

      setIsStreaming(false);
    } catch (err: any) {
      setIsStreaming(false);
      setMessages((prev) => prev.map((m) => (m.id === draftAssistant.id ? { ...m, content: `Error: ${err?.message || err}` } : m)));
    }
  }

  function clearHistory() {
    setMessages([]);
  }

  return (
    <div className="grid grid-rows-[auto,1fr,auto] h-screen">
      <header className="border-b border-neutral-200/10 p-3 flex items-center justify-between">
        <div className="font-semibold">OpenWebUI Analog</div>
        <div className="flex gap-2 items-center text-sm">
          <select
            className="bg-transparent border rounded px-2 py-1"
            value={model}
            onChange={(e) => setModel(e.target.value)}
          >
            <option value="gpt-4o-mini">gpt-4o-mini</option>
            <option value="gpt-4o">gpt-4o</option>
            <option value="gpt-4.1-mini">gpt-4.1-mini</option>
            <option value="o3-mini">o3-mini</option>
          </select>
          <label className="flex items-center gap-2">
            <span>Temp</span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.1}
              value={temperature}
              onChange={(e) => setTemperature(parseFloat(e.target.value))}
            />
          </label>
          <button className="border px-2 py-1 rounded" onClick={clearHistory}>Clear</button>
        </div>
      </header>
      <main className="overflow-y-auto p-4 space-y-4">
        {messages.length === 0 && (
          <div className="opacity-70 text-center mt-10">Start chatting by typing below. Press Ctrl/Cmd+Enter to send.</div>
        )}
        {messages.map((m) => (
          <div key={m.id} className="max-w-3xl mx-auto">
            <div className="text-xs opacity-60 mb-1">{m.role}</div>
            <div className={`whitespace-pre-wrap rounded-xl p-3 ${m.role === "user" ? "bg-blue-50 dark:bg-blue-950/30" : "bg-neutral-50 dark:bg-neutral-800"}`}>
              {m.content}
            </div>
          </div>
        ))}
      </main>
      <footer className="border-t border-neutral-200/10 p-3">
        <div className="max-w-3xl mx-auto flex flex-col gap-2">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Send a message..."
            rows={3}
            className="w-full rounded-xl border p-3 bg-transparent"
          />
          <div className="flex gap-2 flex-wrap items-center">
            <input
              type="password"
              placeholder="API Key (optional if using built-in proxy)"
              className="border rounded px-2 py-1 flex-1 min-w-48"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
            />
            <input
              type="text"
              placeholder="Base URL (e.g., /api/openai or https://api.openai.com/v1)"
              className="border rounded px-2 py-1 flex-1 min-w-48"
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
            />
            <button
              onClick={onSend}
              disabled={!canSend}
              className="px-4 py-2 rounded bg-black text-white disabled:opacity-40"
            >
              {isStreaming ? "Streaming..." : "Send"}
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
}
