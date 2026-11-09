---
id: TBL0402
title: 変更履歴
type: テーブル
status: レビュー中
related: [FN0402, TBL0401, TBL0501]
updated: 2026-10-30
---

# TBL0402 変更履歴

## 1. 概要

| 項目 | 値 |
|---|---|
| 物理名 | `content_history` |
| 概要 | Note・Wiki の版（FN0402）。保存するたびに残し、1 つにつき 100 件まで |
| 定義（正） | `back/src/data/migration/T014_create_content_history.sql` |

## 2. カラム

| 物理名 | 論理名 | 型 | NULL | 既定値 | 意味・値のルール |
|---|---|---|---|---|---|
| `history_id` | 版の ID | INTEGER | 不可 | （自動） | 連番 |
| `kind` | 種類 | TEXT | 不可 | - | `note` / `wiki` |
| `content_id` | 対象 | TEXT | 不可 | - | `note_id` / `wiki_id` |
| `title` | タイトル | TEXT | 不可 | - | その版 |
| `content` | 本文 | TEXT | 不可 | - | その版 |
| `updated_by` | 保存した人 | TEXT | 不可 | - | ユーザー ID |
| `saved_at` | 版の更新日時 | TEXT | 不可 | - | UTC。その版の `updated_at` |

## 3. キー・インデックス

| 種類 | カラム | 目的 |
|---|---|---|
| PK | `history_id` | - |
| INDEX | `kind`, `content_id`, `history_id` | 対象の版を新しい順に引く |

## 4. 他テーブルとの関係

| カラム | 参照先 | 参照先が削除されたとき |
|---|---|---|
| `content_id` | TBL0401 note / TBL0501 wiki | Note・Wiki の削除で消す |

## 5. ライフサイクル

| タイミング | きっかけ（API・バッチの ID） | 内容 |
|---|---|---|
| 作成 | API0405・API0505 | 保存したとき（FN0402-BR01） |
| 削除 | API0405・API0505 | 100 件を超えた古いもの |
| 削除 | API0404・API0504・API0108 | Note・Wiki・ユーザーの削除 |

## 6. 未決事項

-
