---
id: TBL0403
title: Note・Wiki のフォルダ
type: テーブル
status: レビュー中
related: [FN0403, TBL0401, TBL0501]
updated: 2026-10-30
---

# TBL0403 Note・Wiki のフォルダ

## 1. 概要

| 項目 | 値 |
|---|---|
| 物理名 | `content_folder` |
| 概要 | Note・Wiki を分けるフォルダ（FN0403）。入れ子にできる |
| 定義（正） | `back/src/data/migration/T016_create_content_folder.sql` |

## 2. カラム

| 物理名 | 論理名 | 型 | NULL | 既定値 | 意味・値のルール |
|---|---|---|---|---|---|
| `folder_id` | フォルダの ID | TEXT | 不可 | - | `cf_` で始まる |
| `kind` | 種類 | TEXT | 不可 | - | `note` / `wiki` |
| `user_id` | 持ち主・作成者 | TEXT | 不可 | - | Note のフォルダは持ち主（本人だけが使う）。Wiki のフォルダは作成者を表すだけ |
| `parent_id` | 親のフォルダ | TEXT | 不可 | `''` | 空なら一番上 |
| `name` | 名前 | TEXT | 不可 | - | 1〜25 文字。同じ親の下で重ならない（FN0403-BR01） |
| `created_at` | 作成日時 | TEXT | 不可 | 作成した日時 | UTC |

## 3. キー・インデックス

| 種類 | カラム | 目的 |
|---|---|---|
| PK | `folder_id` | - |

## 4. 他テーブルとの関係

| カラム | 参照先 | 参照先が削除されたとき |
|---|---|---|
| `parent_id` | TBL0403 content_folder | 中が空でなければ削除できない（FN0403-BR05） |
| `user_id` | TBL0101 user | Note のフォルダはユーザーの削除で消す |

## 5. ライフサイクル

| タイミング | きっかけ（API・バッチの ID） | 内容 |
|---|---|---|
| 作成 | API0409 | - |
| 更新 | API0410・API0412 | 名前・親 |
| 削除 | API0411・API0108 | 空のフォルダの削除・ユーザーの削除（Note のフォルダ） |

## 6. 未決事項

-
