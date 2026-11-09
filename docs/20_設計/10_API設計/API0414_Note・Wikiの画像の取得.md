---
id: API0414
title: Note・Wiki の画像の取得
type: API
status: レビュー中
related: [FN0404, TBL0405]
updated: 2026-11-08
---

# API0414 Note・Wiki の画像の取得

## 1. 概要

Note・Wiki の本文に貼り付けた画像を返す（FN0404）。画面はトークンを付けて読み込み、表示する。

## 2. エンドポイント

| 項目 | 値 |
|---|---|
| メソッド | GET |
| パス | `/api/content-image/{imageId}` |
| 認証 | 要（ローカルモードはユーザー `local`） |
| 権限 | Wiki の画像は利用者。Note の画像は貼り付けた本人と、その画像を使っている Wiki（今の本文か変更履歴）があるときは利用者 |
| 実装 | `back/src/api/content_image/handler.rs` |

## 3. リクエスト

| 名前 | 場所 | 型 | 必須 | 説明・制約 |
|---|---|---|---|---|
| imageId | path | string | ○ | 画像 ID |

## 4. レスポンス

### 4.1 成功時

| ステータス | 内容 |
|---|---|
| 200 | 画像そのもの。`Content-Type` は保存した形式、`Cache-Control: private, max-age=31536000, immutable`（同じ ID の画像は変わらない）、`X-Content-Type-Options: nosniff` |

### 4.2 エラー時

| ステータス | 条件 |
|---|---|
| 401 | 未ログイン |
| 404 | 無い・見られない（Note の画像があることをほかの人に知らせない） |

## 5. 処理

1. 画像を取り、見られるかを確かめて返す。

## 6. 関連

| 種類 | ID | 名称 |
|---|---|---|
| 機能要件 | FN0404 | Markdown の編集の手助け |
| テーブル | TBL0405 | Note・Wiki の画像 |

## 7. 未決事項

-
