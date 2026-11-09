---
id: TBL0404
title: Note・Wiki の入れ場所
type: テーブル
status: レビュー中
related: [FN0403, TBL0401, TBL0501]
updated: 2026-10-30
---

# TBL0404 Note・Wiki の入れ場所

## 1. 概要

| 項目 | 値 |
|---|---|
| 物理名 | `content_folder_item` |
| 概要 | Note・Wiki がどのフォルダに入っているか（FN0403）。行が無ければ一番上 |
| 定義（正） | `back/src/data/migration/T016_create_content_folder.sql` |

## 2. カラム

| 物理名 | 論理名 | 型 | NULL | 既定値 | 意味・値のルール |
|---|---|---|---|---|---|
| `kind` | 種類 | TEXT | 不可 | - | `note` / `wiki` |
| `item_id` | 対象 | TEXT | 不可 | - | `note_id` / `wiki_id` |
| `folder_id` | 入っているフォルダ | TEXT | 不可 | - | TBL0403 の `folder_id` |

## 3. キー・インデックス

| 種類 | カラム | 目的 |
|---|---|---|
| PK | `kind`, `item_id` | 1 つの Note・Wiki は 1 つのフォルダにだけ入る |

## 4. 他テーブルとの関係

| カラム | 参照先 | 参照先が削除されたとき |
|---|---|---|
| `item_id` | TBL0401 note / TBL0501 wiki | Note・Wiki・ユーザーの削除で消す |
| `folder_id` | TBL0403 content_folder | 中が空でなければフォルダは削除できない |

## 5. ライフサイクル

| タイミング | きっかけ（API・バッチの ID） | 内容 |
|---|---|---|
| 作成・更新 | API0412 | フォルダへ入れたとき |
| 削除 | API0412 | 一番上へ移したとき |
| 削除 | API0404・API0504・API0108 | Note・Wiki・ユーザーの削除 |

## 6. 未決事項

-
