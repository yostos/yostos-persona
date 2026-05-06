import type { Source } from "./types";

export function buildSystemPrompt(
  systemPrompt: string,
  contexts: { text: string; meta: { title: string; url: string } }[],
): string {
  const references = contexts
    .map((c, i) => `### 参考${i + 1}: ${c.meta.title}\nURL: ${c.meta.url}\n\n${c.text}`)
    .join("\n\n");

  return `${systemPrompt}

## 参考情報（ブログ記事から取得）
${references || "（該当する参考情報はありません）"}`;
}

export function extractSources(contexts: { meta: { title: string; url: string } }[]): Source[] {
  const seen = new Set<string>();
  const sources: Source[] = [];
  for (const c of contexts) {
    if (!seen.has(c.meta.url)) {
      seen.add(c.meta.url);
      sources.push({ title: c.meta.title, url: c.meta.url });
    }
  }
  return sources;
}
