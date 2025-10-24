import { NextRequest } from "next/server";

export const runtime = "edge";

function mapMessages(messages: { role: string; content: string }[]) {
  return messages.map((m) => ({ role: m.role, content: m.content }));
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { apiKey, baseUrl, model, temperature, messages } = body as {
      apiKey?: string;
      baseUrl?: string;
      model: string;
      temperature?: number;
      messages: { role: string; content: string }[];
    };

    const upstreamUrl = (baseUrl && !baseUrl.startsWith("/api"))
      ? baseUrl.replace(/\/$/, "") + "/chat/completions"
      : (process.env.OPENAI_BASE_URL?.replace(/\/$/, "") || "https://api.openai.com/v1") + "/chat/completions";

    const key = apiKey || process.env.OPENAI_API_KEY;
    if (!key) {
      return new Response("Missing API key", { status: 400 });
    }

    const res = await fetch(upstreamUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        model,
        temperature: typeof temperature === "number" ? temperature : 0.7,
        stream: true,
        messages: mapMessages(messages),
      }),
    });

    if (!res.ok || !res.body) {
      const text = await res.text();
      return new Response(`Upstream error: ${res.status} ${text}`, { status: 500 });
    }

    const encoder = new TextEncoder();
    const readable = new ReadableStream({
      async start(controller) {
        const reader = res.body!.getReader();
        const decoder = new TextDecoder();
        let done = false;
        let buffer = "";
        while (!done) {
          const { value, done: d } = await reader.read();
          done = d;
          if (value) buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split(/\r?\n/);
          buffer = lines.pop() || "";
          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed.startsWith("data:")) continue;
            const data = trimmed.slice(5).trim();
            if (data === "[DONE]") {
              controller.close();
              return;
            }
            try {
              const json = JSON.parse(data);
              const delta = json.choices?.[0]?.delta?.content || "";
              if (delta) controller.enqueue(encoder.encode(delta));
            } catch {}
          }
        }
      },
    });

    return new Response(readable, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-cache",
      },
    });
  } catch (e: any) {
    return new Response(`Bad request: ${e?.message || e}`, { status: 400 });
  }
}
