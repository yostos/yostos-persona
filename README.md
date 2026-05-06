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
│   │   ├── prompt.ts       # システムプロンプト組み立て（ペルソナは env.SYSTEM_PROMPT から）
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

### Persona ファイル

ペルソナ・回答ルールは秘匿情報として `.persona`（リポジトリルート、Git 管理対象外）に保存する。
このファイルは `npm run dev`（ローカル）と Cloudflare Secrets（本番）の両方の入力源となる。

新規環境では、既存の `.persona` を安全な経路（パスワードマネージャ等）経由で取得して配置すること。

#### ファイル形式

- プレーンテキスト（UTF-8、改行 LF）
- そのままシステムプロンプトの先頭に注入される
- 末尾には自動的に `## 参考情報（ブログ記事から取得）` 以降が連結されるため、`.persona` 内では参考情報セクションを書かないこと
- 推奨される構造（必須ではない）:

  ```text
  あなたは「<名前>」として回答してください。

  ## プロフィール
  - <属性 1>
  - <属性 2>

  ## 口調・性格
  - <口調・性格 1>

  ## 回答スタイル
  - <スタイル 1>
  - 200〜300文字程度を目安

  ## スタンス
  - <思想・立場>

  ## 回答ルール
  - 日本語のみで回答すること
  - 参考情報を踏まえて回答すること
  - 引用元を明示すること
  - 回答のみを返すこと（JSON やメタ情報は含めない）
  ```

- セクション見出しや項目構成は LLM に対するヒントとして機能する。順序や粒度は運用しながら調整する
- バックティック・引用符・特殊文字も平文のまま記述してよい（`wrangler secret put` は stdin をそのまま値として送る）

### Cloudflare Secrets への反映

```bash
wrangler secret put SYSTEM_PROMPT < .persona
```

`.persona` を更新したら、上記コマンドで本番 Workers にも反映する。

### Development

```bash
npm run dev          # ローカル開発サーバー起動（.persona を読み込む）
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
