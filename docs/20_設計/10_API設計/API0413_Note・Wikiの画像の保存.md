---
id: API0413
title: Note・Wiki の画像の保存
type: API
status: レビュー中
related: [FN0404, TBL0405]
updated: 2026-11-08
---

# API0413 Note・Wiki の画像の保存

## 1. 概要

Note・Wiki の本文に貼り付ける画像を受け取って保存し、本文に書く URL を返す（FN0404-BR02）。画像は画面で縮小してから送る。

## 2. エンドポイント

| 項目 | 値 |
|---|---|
| メソッド | POST |
| パス | `/api/content-image/upload?kind={kind}` |
| 認証 | 要（ローカルモードはユーザー `local`） |
| 権限 | 利用者 |
| 実装 | `back/src/api/content_image/handler.rs` |

## 3. リクエスト

| 名前 | 場所 | 型 | 必須 | 説明・制約 |
|---|---|---|---|---|
| kind | query | string | ○ | `note` / `wiki` |
| （本文） | body | バイナリ | ○ | 画像そのもの。PNG・JPEG・GIF・WebP（形式は中身の先頭のバイトで判断する）。10 MB まで |

## 4. レスポンス

### 4.1 成功時

| ステータス | 内容 |
|---|---|
| 200 | 保存成功 |

| 名前 | 型 | 説明 |
|---|---|---|
| imageId | string | 画像 ID（`im_…`） |
| url | string | 本文に書く URL（`/api/content-image/{imageId}`） |

### 4.2 エラー時

| ステータス | 条件 |
|---|---|
| 400 | `kind` が違う・PNG・JPEG・GIF・WebP でない |
| 401 | 未ログイン |
| 413 | 10 MB を超える |

## 5. 処理

1. 種類・大きさ・形式を確かめる。
2. 画像 ID を作って TBL0405 に入れ、URL を返す。

## 6. 関連

| 種類 | ID | 名称 |
|---|---|---|
| 機能要件 | FN0404 | Markdown の編集の手助け |
| テーブル | TBL0405 | Note・Wiki の画像 |

## 7. 未決事項

-
