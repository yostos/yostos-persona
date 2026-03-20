# Changelog

## v0.5.1 (2026-03-20)

### Fixed

- ブログ記事URLにファイルパスから年月（YYYY/MM）を抽出して含めるよう修正 (#1)
  - Before: `/blog/contentful/`
  - After: `/blog/2025/03/contentful/`

## v0.5.0 (2026-03-19)

### Added

- Cloudflare Workers AI + Vectorize による RAG ベースの AI Q&A システム
- フロントエンド: `ask.codedchords.dev` で公開される単一ページ UI
  - tabi テーマに合わせたデザイン（ダーク/ライトモード対応）
  - レスポンシブ対応（600px / 300px ブレイクポイント）
  - 質問する / クリアのボタン切り替え
  - IME 対応の Enter 送信
  - クライアント側 3 秒クールダウン
- Workers API: `POST /api/ask` エンドポイント
  - 入力バリデーション（空文字拒否、500 文字上限）
  - CORS（codedchords.dev, ask.codedchords.dev）
- RAG パイプライン: BGE-M3 embedding → Vectorize 検索（上位 5 件、スコア閾値 0.3）
- LLM: Llama 3.3 70B Instruct（ペルソナ付きシステムプロンプト）
- Ingest スクリプト: TOML front matter パース、`##` 見出し単位チャンク分割、差分検出（manifest.json）
  - 286 記事を処理・Vectorize に投入済み
- CI/CD: GitHub Actions（`content/**` push + workflow_dispatch トリガー）
- プロジェクトドキュメント: 構想書・技術仕様書・セットアップ記録

### Technical Details

- Embedding: `@cf/baai/bge-m3`（1024 次元）
  - PLaMo-Embedding-1B は 2048 次元で Vectorize 上限（1536）超過のため不採用
- Vectorize メタデータ上限（10240 bytes）対策: チャンク本文を 8000 bytes に切り詰め
- 環境変数: `CLOUDFLARE_ACCOUNT_ID` / `CLOUDFLARE_API_TOKEN` に統一
