// OpenRouter client for Hermes signal generation. Server-only.

const HERMES_MODEL = "nousresearch/hermes-4-405b";
const ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export async function callHermes(
  messages: ChatMessage[],
  opts: { temperature?: number; json?: boolean; model?: string } = {},
) {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) throw new Error("OPENROUTER_API_KEY missing");
  const body: any = {
    model: opts.model ?? HERMES_MODEL,
    messages,
    temperature: opts.temperature ?? 0.2,
  };
  if (opts.json) body.response_format = { type: "json_object" };
  const r = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
      "HTTP-Referer": "https://lovable.dev",
      "X-Title": "IG CFD Day Trader",
    },
    body: JSON.stringify(body),
  });
  if (!r.ok) {
    const t = await r.text();
    throw new Error(`OpenRouter ${r.status}: ${t.slice(0, 500)}`);
  }
  const json = (await r.json()) as any;
  const content = json?.choices?.[0]?.message?.content ?? "";
  return content as string;
}

export function parseJsonLoose<T = unknown>(s: string): T | null {
  if (!s) return null;
  try { return JSON.parse(s) as T; } catch {}
  // Strip fences
  const m = s.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (m) {
    try { return JSON.parse(m[1]) as T; } catch {}
  }
  // First {...} or [...]
  const first = s.search(/[\[{]/);
  if (first >= 0) {
    const candidate = s.slice(first);
    try { return JSON.parse(candidate) as T; } catch {}
  }
  return null;
}
