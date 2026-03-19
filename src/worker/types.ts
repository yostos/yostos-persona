export interface Env {
  AI: Ai;
  VECTORIZE: VectorizeIndex;
  ASSETS: Fetcher;
  RATE_LIMIT: KVNamespace;
}

export interface ArticleMeta {
  slug: string;
  title: string;
  section: string;
  url: string;
  date: string;
  tags: string[];
}

export interface Chunk {
  id: string;
  text: string;
  meta: ArticleMeta;
}

export interface AskRequest {
  question: string;
}

export interface AskResponse {
  answer: string;
  sources: Source[];
}

export interface Source {
  title: string;
  url: string;
}

export interface ErrorResponse {
  error: string;
  code: string;
}

export interface ManifestEntry {
  hash: string;
  last_processed: string;
  chunk_count: number;
}

export interface Manifest {
  articles: Record<string, ManifestEntry>;
}
