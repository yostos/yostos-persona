import type { Env } from "./types";

export interface RetrievedChunk {
  text: string;
  meta: {
    slug: string;
    title: string;
    section: string;
    url: string;
  };
  score: number;
}

const SCORE_THRESHOLD = 0.3;
const TOP_K = 5;

export async function retrieveChunks(
  question: string,
  env: Env
): Promise<RetrievedChunk[]> {
  // Embed the question
  const embeddingResult = await env.AI.run("@cf/baai/bge-m3", {
    text: [question],
  });

  const queryVector = embeddingResult.data[0];

  // Search Vectorize
  const results = await env.VECTORIZE.query(queryVector, {
    topK: TOP_K,
    returnValues: false,
    returnMetadata: "all",
  });

  // Filter by score threshold and map to chunks
  return results.matches
    .filter((m) => m.score >= SCORE_THRESHOLD)
    .map((m) => ({
      text: (m.metadata?.text as string) || "",
      meta: {
        slug: (m.metadata?.slug as string) || "",
        title: (m.metadata?.title as string) || "",
        section: (m.metadata?.section as string) || "",
        url: (m.metadata?.url as string) || "",
      },
      score: m.score,
    }));
}
