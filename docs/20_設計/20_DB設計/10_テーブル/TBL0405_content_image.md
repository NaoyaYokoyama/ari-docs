---
id: TBL0405
title: Note・Wiki の画像
type: テーブル
status: レビュー中
related: [FN0404, TBL0401, TBL0402, TBL0501]
updated: 2026-11-08
---

# TBL0405 Note・Wiki の画像

## 1. 概要

| 項目 | 値 |
|---|---|
| 物理名 | `content_image` |
| 概要 | Note・Wiki の本文に貼り付けた画像（FN0404）。画面で縮小したもの。DB に入れるのでバックアップ・復元で本文と一緒に扱える |
| 定義（正） | `back/src/data/migration/T017_create_content_image.sql` |

## 2. カラム

| 物理名 | 論理名 | 型 | NULL | 既定値 | 意味・値のルール |
|---|---|---|---|---|---|
| `image_id` | 画像 ID | TEXT | 不可 | - | `im_` で始まる。本文には `/api/content-image/{image_id}` と書く |
| `kind` | 種類 | TEXT | 不可 | - | 貼り付けた先。`note` / `wiki` |
| `user_id` | 貼り付けた人 | TEXT | 不可 | - | ユーザー ID |
| `mime` | 形式 | TEXT | 不可 | - | `image/webp`・`image/jpeg`・`image/png`・`image/gif` |
| `data` | 画像 | BLOB | 不可 | - | 10 MB まで |
| `size` | 大きさ | INTEGER | 不可 | - | バイト数 |
| `created_at` | 貼り付けた日時 | TEXT | 不可 | CURRENT_TIMESTAMP | UTC |

## 3. キー・インデックス

| 種類 | カラム | 目的 |
|---|---|---|
| PK | `image_id` | - |

## 4. 他テーブルとの関係

| カラム | 参照先 | 参照先が削除されたとき |
|---|---|---|
| `image_id` | TBL0401 note・TBL0501 wiki・TBL0402 content_history の本文（文字として含む） | どこからも使われなくなり 1 日たったら消す（FN0404-BR05） |

## 5. ライフサイクル

| タイミング | きっかけ（API・バッチの ID） | 内容 |
|---|---|---|
| 作成 | API0413 | 貼り付けたとき |
| 削除 | BAT0901 | 本文・変更履歴のどこからも使われず、貼り付けてから 1 日たったもの（毎時 15 分） |

## 6. 未決事項

-
