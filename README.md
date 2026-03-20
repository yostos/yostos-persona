# yostos-persona

[![GitHub release](https://img.shields.io/github/v/release/yostos/yostos-persona)](https://github.com/yostos/yostos-persona/releases)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Cloudflare Workers](https://img.shields.io/badge/Cloudflare-Workers-F38020?logo=cloudflare&logoColor=white)](https://workers.cloudflare.com/)
[![Ingest & Deploy](https://github.com/yostos/yostos-persona/actions/workflows/ingest.yml/badge.svg)](https://github.com/yostos/yostos-persona/actions/workflows/ingest.yml)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)

[codedchords.dev](https://codedchords.dev) のブログ記事をベースにした AI Q&A システム。Cloudflare Workers AI + Vectorize による RAG パイプラインで、筆者のペルソナを持つ AI が質問に回答します。

**Live:** [ask.codedchords.dev](https://ask.codedchords.dev)

## Architecture

```
[ブラウザ] → [Cloudflare Workers] → [Workers AI: BGE-M3 Embedding] → [Vectorize]
                                   → [Workers AI: Llama 3.3 70B]    → [レスポンス]
```

1. ユーザーが質問を入力
2. Workers AI の BGE-M3 で質問をベクトル化
3. Vectorize で類似チャンクを検索（上位 5 件、スコア閾値 0.3）
4. システムプロンプト（ペルソナ設定）+ チャンク + 質問を LLM に渡す
5. 日本語で回答を生成し、ソース記事リンクとともに返却

## Project Structure

```
├── content/                # ブログ記事 Markdown（Zola フォーマット）
│   ├── blog/               # ブログ記事（YYYY/MM/slug/index.md）
│   ├── projects/           # プロジェクト記事
│   ├── about/              # About ページ
│   └── music/              # Music ページ
├── src/
│   ├── worker/             # Cloudflare Workers
│   │   ├── index.ts        # エントリポイント（POST /api/ask）
│   │   ├── rag.ts          # Vectorize 検索ロジック
│   │   ├── prompt.ts       # システムプロンプト定義
│   │   └── types.ts        # 型定義
│   └── frontend/           # チャット UI（静的 HTML）
│       └── index.html
├── scripts/
│   ├── ingest.ts           # Markdown → チャンク → Embedding → Vectorize
│   └── manifest.json       # 差分検出用マニフェスト
├── docs/                   # 構想書・技術仕様書
├── wrangler.toml           # Cloudflare Workers 設定
└── package.json
```

## Getting Started

### Prerequisites

- Node.js 20+
- [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/)
- Cloudflare アカウント（Workers AI, Vectorize, KV が有効）

### Setup

```bash
npm install
```

### Development

```bash
npm run dev          # ローカル開発サーバー起動
```

### Ingest（記事の取り込み）

```bash
npm run ingest:dry-run   # チャンク分割の確認（Vectorize には書き込まない）
npm run ingest           # Vectorize へ記事を投入
```

`content/` 配下に変更を push すると、GitHub Actions で自動的に ingest & deploy が実行されます。

### Deploy

```bash
npm run deploy       # Cloudflare Workers にデプロイ
```

## Cloudflare Services

| サービス | 用途 |
|----------|------|
| Workers | API エンドポイント、リクエスト処理 |
| Workers AI (BGE-M3) | Embedding（1024 次元） |
| Workers AI (Llama 3.3 70B) | ペルソナ付き回答生成 |
| Vectorize | 記事チャンクのベクトル DB |
| KV | IP ベースレート制限 |

## License

[MIT](LICENSE)
