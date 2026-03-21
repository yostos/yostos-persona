# Cloudflare セキュリティ設定（ask.codedchords.dev）

対象サイト: `ask.codedchords.dev`
実施日: 2026-03-20

## 背景

Cloudflare Observability でスキャンと思われるアクセスを確認:
- `GET /.env` — 環境変数ファイルの探索
- `/checkout`, `/plans`, `/signup` — 一般的なSaaSパスの総当たり
- `favicon.ico`, `apple-touch-icon.png` 等の連続リクエスト — フィンガープリンティング

## 実施内容

### 1. Bot Fight Mode の有効化

- [x] 完了（既に有効化済みを確認）

**手順:**
1. Cloudflare ダッシュボードにログイン
2. `ask.codedchords.dev` のドメインを選択
3. 左メニュー: **Security** > **Bots**
4. **Bot Fight Mode** を **ON** にする

### 2. カスタムルール（WAF）

- [x] 完了

**ルール2-1: Block common scan paths**（全ドメイン共通）

- Security > Security rules > Create rule > Custom rules
- Expression:

```
(http.request.uri.path contains ".env") or (http.request.uri.path contains "wp-login") or (http.request.uri.path contains "wp-admin") or (http.request.uri.path contains "xmlrpc.php") or (http.request.uri.path contains "phpmyadmin") or (http.request.uri.path contains "wp-content") or (http.request.uri.path contains "wp-includes")
```

- Action: Block

**ルール2-2: Allow only valid paths for ask subdomain**（ask.codedchords.dev 限定）

- Expression:

```
(http.host eq "ask.codedchords.dev") and not (http.request.uri.path eq "/" or http.request.uri.path contains "/api/")
```

- Action: Block
- Place at: First（ルール2-1 より先に評価）

### 3. Rate Limiting の設定

- [x] 完了

- Security > Security rules > Create rule > Rate limiting rules
- Rule name: `Rate limit requests`
- Expression: `(http.host eq "ask.codedchords.dev")`
- Characteristics: IP
- Rate: 10 requests / 10 seconds
- Action: Block（Duration: 10 seconds）※無料プランの上限
- 無料プランは Rate limiting rule 1件まで

> **備考:** Worker 側にも `/api/ask` に対して同一IP 60秒間10リクエストの制限あり（`src/worker/index.ts`）。Cloudflare 側はスキャナー等の大量アクセスを手前で弾く役割。

## 設定状況

| ルール | 種別 | 対象 | Status |
|---|---|---|---|
| Bot Fight Mode | Bots | codedchords.dev 全体 | Active |
| Allow only valid paths for ask subdomain | Custom rule #1 | ask.codedchords.dev | Active |
| Block common scan paths | Custom rule #2 | codedchords.dev 全体 | Active |
| Rate limit requests | Rate limiting | ask.codedchords.dev | Active |
