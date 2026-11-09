---
id: TBL0501
title: Wiki
type: テーブル
status: レビュー中
related: [FN0501, TBL0101]
updated: 2026-10-30
---

# TBL0501 Wiki

## 1. 概要

| 項目 | 値 |
|---|---|
| 物理名 | `wiki` |
| 概要 | 共有ナレッジ用の文書（FN0501）。 |
| 定義（正） | `back/src/data/migration/T007_create_wiki.sql` |

## 2. カラム

| 物理名 | 論理名 | 型 | NULL | 既定値 | 意味・値のルール |
|---|---|---|---|---|---|
| `wiki_id` | Wiki ID | TEXT | 不可 | - | `wk_` で始まる ID |
| `user_id` | 作成者 | TEXT | 不可 | - | 作成したユーザー（`local`）。絞り込みには使わない（FN0501-BR01） |
| `title` | タイトル | TEXT | 不可 | - | 作成時は 1〜20 文字（FN0501-BR02） |
| `content` | 本文 | TEXT | 不可 | '' | Markdown |
| `updated_at` | 更新日時 | TEXT | 不可 | CURRENT_TIMESTAMP | 作成・更新した日時（UTC）。保存の食い違いの確認に使う（FN0501-BR10） |
| `updated_by` | 最後に更新した人 | TEXT | 不可 | '' | ユーザー ID。作成しただけなら空文字（画面では作成者を出す。`T013_add_wiki_updated_by.sql`。FN0501-BR09） |

## 3. キー・インデックス

| 種類 | カラム | 目的 |
|---|---|---|
| PK | `wiki_id` | - |

## 4. 他テーブルとの関係

| カラム | 参照先 | 参照先が削除されたとき |
|---|---|---|
| `user_id` | TBL0101 user | 行は残る |

## 5. ライフサイクル

| タイミング | きっかけ（API・バッチの ID） | 内容 |
|---|---|---|
| 作成 | API0503 | 作成者を記録し、本文は空文字で作成する |
| 更新 | API0505 | タイトル・本文・更新日時を更新する |
| 削除 | API0504 | お気に入りとあわせて削除する |

## 6. 未決事項

- 最終更新者（`updated_by`）の列を追加するか（RQ0502）
- T007 だけ `DROP TABLE IF EXISTS` が無い（他と書き方が違う）
