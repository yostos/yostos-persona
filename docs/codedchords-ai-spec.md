# codedchords.dev/ask/ — 技術仕様書

## アーキテクチャ概要

```
[ブラウザ] → [Cloudflare Workers] → [Workers AI: Embedding] → [Vectorize]
                                   → [Workers AI: LLM] → [レスポンス]
```

リクエスト時の処理フロー:

1. ユーザーが `/ask/` ページで質問を入力
2. Workers が質問テキストを受け取る
3. Workers AI の embedding モデルで質問をベクトル化
4. Vectorize で類似チャンクを検索（上位 3〜5 件）
5. システムプロンプト（キャラクタ設定）＋ 取得したチャンク ＋ 質問を Workers AI の LLM に渡す
6. LLM が日本語で回答を生成
7. 回答テキスト＋ソース記事リンクをフロントエンドに返す

## リポジトリ構成

```
codedchords-ai/
├── content/                  # メインブログからコピーした Markdown
│   ├── blog/
│   │   ├── article-1.md
│   │   ├── article-2.md
│   │   └── ...
├── src/
│   ├── worker/               # Cloudflare Workers コード
│   │   ├── index.ts          # メインエントリポイント
│   │   ├── rag.ts            # Vectorize 検索ロジック
│   │   ├── prompt.ts         # システムプロンプト定義
│   │   └── types.ts
│   └── frontend/             # チャット UI（静的 HTML/CSS/JS）
│       └── index.html
├── scripts/
│   ├── ingest.ts             # Markdown → チャンク分割 → embedding → Vectorize 格納
│   ├── manifest.json         # slug → MD5 ハッシュのマッピング（差分検出用）
│   └── copy-content.sh       # メインブログからの content コピー用スクリプト
├── .github/
│   └── workflows/
│       └── ingest.yml        # push トリガーの GitHub Actions
├── wrangler.toml             # Cloudflare Workers 設定
├── package.json
└── README.md
```

## 使用する Cloudflare サービス

| サービス | 用途 |
|----------|------|
| Workers | API エンドポイント、リクエスト処理 |
| Workers AI (Embedding) | 質問テキストのベクトル化、記事チャンクのベクトル化（ingest 時） |
| Workers AI (LLM) | ペルソナ付き回答の生成 |
| Vectorize | 記事チャンクのベクトル DB |
| Pages または Workers Route | フロントエンド（チャット UI）のホスティング |
| KV（検討中） | 回答キャッシュ |

## モデル選定

### Embedding モデル

BGE-M3（`@cf/baai/bge-m3`）

- BAAI 開発の多言語対応 embedding モデル（1024 次元）
- Workers AI 上で利用可能
- 日本語・英語混在テキストに対応
- 当初 PLaMo-Embedding-1B を予定していたが、出力が 2048 次元で Vectorize の上限（1536）を超えるため変更

### LLM モデル

Llama 3.3 70B Instruct FP8 Fast（`@cf/meta/llama-3.3-70b-instruct-fp8-fast`）

- 128K トークンのコンテキストウィンドウ
- 日本語での回答生成能力（検証済み、概ね良好）
- 既知の課題: 中国語の文字が混入することがある → システムプロンプトで抑制する
- Neuron コストは入力＋出力トークン数に比例

## チャンク戦略

### 分割方針

- Markdown の front matter からメタデータ（slug, title, date, tags, description）を抽出
- 本文を見出し（`##`）単位でセクション分割
- 各チャンクにメタデータ（slug, title, section_heading）を付与
- チャンクサイズの目安: 500〜1000 トークン程度
- 短すぎるセクションは前後と結合、長すぎるセクションは段落単位で分割

### チャンクのメタデータ

各チャンクに以下のメタデータを Vectorize に格納する:

```json
{
  "slug": "beatles-rain-mastering",
  "title": "Beatles \"Rain\" のマスタリング覚書",
  "section": "ボーカルトラックの処理",
  "url": "https://codedchords.dev/blog/beatles-rain-mastering/"
}
```

回答生成後、使用したチャンクの URL をソースリンクとしてフロントエンドに返す。

## システムプロンプト設計

```
あなたは「Toshiyuki」として回答してください。

[キャラクタ設定: プロフィール、専門分野、口調の指定]

## 回答ルール
- 日本語のみで回答すること。中国語の文字（簡体字・繁体字）は絶対に使わないこと
- 以下の参考情報を踏まえて回答すること
- 参考情報に直接的な答えがなくても、自分の経験や知見に基づいて回答すること
- 参考情報から引用した場合は、どの記事を参照したかを明示すること
- 回答は簡潔に。200〜300文字程度を目安とする

## 参考情報（ブログ記事から取得）
{Vectorize から取得したチャンク群をここに挿入}
```

## API 設計

### エンドポイント

```
POST /api/ask
Content-Type: application/json

{
  "question": "Beatlesの曲をカバーするとき..."
}
```

### レスポンス

```json
{
  "answer": "Beatlesのカバーでは...",
  "sources": [
    {
      "title": "Beatles \"Rain\" のマスタリング覚書",
      "url": "https://codedchords.dev/blog/beatles-rain-mastering/"
    }
  ]
}
```

### エラーレスポンス

```json
{
  "error": "回答の生成に失敗しました",
  "code": "LLM_ERROR"
}
```

## フロントエンド

シンプルな単一ページ構成。

- テキスト入力フォーム（質問入力）
- 送信ボタン
- 回答表示エリア（テキスト＋ソース記事リンク）
- ローディングインジケータ
- フレームワークは使わず、素の HTML/CSS/JS で構築
- レスポンシブ対応（モバイル閲覧を考慮）
- tabi テーマのデザイントーンに合わせる

## ホスティング方式

2つの選択肢がある（実装時に決定）:

### 方式A: Workers Route

`codedchords.dev/ask/*` を Workers Route で Workers にルーティングする。メインブログ（Cloudflare Pages）と同一ドメインで共存できるが、Pages と Workers Route の優先順位の設定に注意が必要。

### 方式B: サブドメイン

`ask.codedchords.dev` に Workers をデプロイする。メインブログとは完全に分離。CORS の設定が必要になるが、構成はシンプル。

## CI/CD パイプライン

### トリガー

`codedchords-ai` リポジトリへの push（`content/` ディレクトリに変更がある場合）

### 処理フロー

```
1. content/ 内の Markdown ファイルのリストを取得
2. manifest.json と比較して変更のあるファイルを特定
3. 変更ファイルについて:
   a. front matter 解析＋本文チャンク分割
   b. Workers AI Embedding API で各チャンクをベクトル化
   c. Vectorize にアップサート（slug + section をキーとして）
4. manifest.json を更新してコミット
5. wrangler deploy で Workers / Pages をデプロイ
```

### 差分検出

```json
// manifest.json の構造
{
  "articles": {
    "beatles-rain-mastering": {
      "hash": "a1b2c3d4e5f6...",
      "last_processed": "2026-03-19T00:00:00Z",
      "chunk_count": 5
    }
  }
}
```

Markdown ファイルの MD5 ハッシュを比較し、変更があった記事のみ再処理する。削除された記事のチャンクは Vectorize から削除する。

## コスト見積もり

### リクエスト時（1回の質問あたり）

| 処理 | モデル | 推定コスト |
|------|--------|------------|
| クエリ embedding | BGE-M3 | 極小（数 Neurons） |
| Vectorize 検索 | — | 無料枠内 |
| LLM 回答生成 | Llama 3.3 70B | 入力 2000〜3000 トークン + 出力 300〜500 トークン |

### デプロイ時（記事 1 本あたり）

| 処理 | モデル | 推定コスト |
|------|--------|------------|
| チャンク embedding（5 チャンク想定） | BGE-M3 | 極小 |
| Vectorize upsert | — | 無料枠内 |

### 月間コスト想定

個人ブログの規模（1日数件の質問）であれば、Workers AI の無料枠（10,000 Neurons/日）で十分収まる見込み。超過した場合でも月 $5 + 数ドル程度。

## セットアップ記録

### Vectorize インデックス作成（2026-03-19）

```bash
npx wrangler vectorize create yostos-persona --dimensions 1024 --metric cosine
```

- モデル: BGE-M3（`@cf/baai/bge-m3`）— 出力 1024 次元
- メトリック: cosine
- インデックス名: `yostos-persona`

### ホスティング方式（2026-03-19）

サブドメイン方式（`ask.codedchords.dev`）を採用。`wrangler.toml` で `custom_domain = true` を設定し、デプロイ時に DNS レコードが自動作成される。

### GitHub Secrets（2026-03-19）

リポジトリの Repository secrets に以下を登録:
- `CLOUDFLARE_ACCOUNT_ID`
- `CLOUDFLARE_API_TOKEN`

### Cloudflare API トークン権限（2026-03-19）

デプロイに必要な権限一覧:

**Account 権限:**
- Workers Scripts > Edit
- Workers AI > Edit
- Vectorize > Edit

**Zone 権限（codedchords.dev）:**
- Workers Routes > Edit
- DNS > Edit
- Zone Resources: Include → Specific zone → codedchords.dev

### 初回 Ingest（2026-03-19）

```bash
npm run ingest
```

- 286 記事を処理、全件 Vectorize に投入完了
- Vectorize メタデータ上限（10240 bytes）対策として、チャンク本文を 8000 bytes に切り詰め

### 初回デプロイ（2026-03-19）

```bash
npx wrangler deploy
```

- Worker ID: `505abfb9-9770-476a-a871-127f73f26a54`
- カスタムドメイン `ask.codedchords.dev` が自動設定された

## 検証済み事項

- Workers AI の Llama 3.3 70B は日本語でペルソナ付き回答を生成できる（品質は概ね良好）
- 中国語文字の混入が発生する（システムプロンプトでの抑制が必要）
- 口調の統一にはプロンプトの調整が必要
- Workers AI の MeloTTS は日本語非対応（音声出力は断念）
- BGE-M3 の出力次元数は 1024（Vectorize インデックス作成時に確認済み）
- PLaMo-Embedding-1B は出力 2048 次元で Vectorize 上限（1536）を超えるため不採用

## 未検証・要検討事項

- BGE-M3 の日本語検索精度（日英混在テキストでの挙動）
- チャンクサイズの最適値（RAG の回答品質への影響）
- ~~ホスティング方式（Workers Route vs サブドメイン）の決定~~ → サブドメイン方式に決定
- KV キャッシュの必要性とキャッシュキーの設計
- フロントエンドのデザイン（tabi テーマとの整合性）
- レート制限（悪用防止）
- LLM の max_tokens 最適値（回答品質とコストのバランス）
