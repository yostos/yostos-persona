import type { Env, AskRequest, AskResponse, ErrorResponse } from "./types";
import { retrieveChunks } from "./rag";
import { buildSystemPrompt, extractSources } from "./prompt";

const RATE_LIMIT_MAX = 10; // 最大リクエスト数
const RATE_LIMIT_WINDOW = 60; // ウィンドウ（秒）

async function checkRateLimit(ip: string, kv: KVNamespace): Promise<boolean> {
  const key = `rl:${ip}`;
  const val = await kv.get(key);
  const count = val ? parseInt(val, 10) : 0;
  if (count >= RATE_LIMIT_MAX) {
    return false;
  }
  await kv.put(key, String(count + 1), { expirationTtl: RATE_LIMIT_WINDOW });
  return true;
}

const ALLOWED_ORIGINS = [
  "https://codedchords.dev",
  "https://ask.codedchords.dev",
];

function corsHeaders(origin: string | null): Record<string, string> {
  const headers: Record<string, string> = {
    "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    headers["Access-Control-Allow-Origin"] = origin;
  }
  return headers;
}

function jsonResponse(body: AskResponse | ErrorResponse, status: number, origin: string | null): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...corsHeaders(origin),
    },
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const origin = request.headers.get("Origin");

    // CORS preflight
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }

    // API endpoint
    if (url.pathname === "/api/ask" && request.method === "POST") {
      return handleAsk(request, env, origin);
    }

    // Serve frontend for all other routes
    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;

async function handleAsk(request: Request, env: Env, origin: string | null): Promise<Response> {
  // Rate limiting by IP
  const ip = request.headers.get("CF-Connecting-IP") || "unknown";
  const allowed = await checkRateLimit(ip, env.RATE_LIMIT);
  if (!allowed) {
    return jsonResponse(
      { error: "リクエストが多すぎます。しばらく待ってからお試しください", code: "RATE_LIMITED" },
      429,
      origin,
    );
  }

  let body: AskRequest;
  try {
    body = await request.json<AskRequest>();
  } catch {
    return jsonResponse({ error: "Invalid JSON", code: "INVALID_JSON" }, 400, origin);
  }

  const question = body.question?.trim();
  if (!question) {
    return jsonResponse({ error: "質問を入力してください", code: "EMPTY_QUESTION" }, 400, origin);
  }
  if (question.length > 500) {
    return jsonResponse({ error: "質問は500文字以内にしてください", code: "QUESTION_TOO_LONG" }, 400, origin);
  }

  try {
    // RAG: retrieve relevant chunks
    const chunks = await retrieveChunks(question, env);

    const contexts = chunks.map((c) => ({
      text: c.text,
      meta: { title: c.meta.title, url: c.meta.url },
    }));

    // Build prompt and call LLM
    const systemPrompt = buildSystemPrompt(env.SYSTEM_PROMPT, contexts);

    const llmResult = await env.AI.run("@cf/meta/llama-3.3-70b-instruct-fp8-fast", {
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: question },
      ],
      max_tokens: 512,
    });

    const answer = (llmResult as { response?: string }).response || "回答を生成できませんでした。";
    const sources = extractSources(contexts);

    return jsonResponse({ answer, sources }, 200, origin);
  } catch (err) {
    console.error("Ask error:", err);
    return jsonResponse({ error: "回答の生成に失敗しました", code: "LLM_ERROR" }, 500, origin);
  }
}
