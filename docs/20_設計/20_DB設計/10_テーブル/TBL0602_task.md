---
id: TBL0602
title: タスク
type: テーブル
status: レビュー中
related: [FN0602, TBL0101, API0607, API0608, API0609, API0610, API0611, API0612, API0613]
updated: 2026-11-28
---

# TBL0602 タスク

## 1. 概要

| 項目 | 値 |
|---|---|
| 物理名 | `task` |
| 概要 | 個人のタスク（FN0602）。作った本人だけが見る・変える（Note と同じ） |
| 定義（正） | `back/src/data/migration/T026_task.sql`・`T027_task_repeat.sql`・`T028_task_wbs.sql` |

## 2. カラム

| 物理名 | 論理名 | 型 | NULL | 既定値 | 意味・値のルール |
|---|---|---|---|---|---|
| `task_id` | タスク ID | TEXT | 不可 | - | `tk_` で始まる |
| `user_id` | 持ち主 | TEXT | 不可 | - | 作った人のユーザー ID |
| `title` | タイトル | TEXT | 不可 | - | 100 文字まで（FN0602-BR02） |
| `description` | メモ | TEXT | 不可 | `''` | 10000 文字まで |
| `priority` | 優先度 | TEXT | 不可 | `medium` | `high` / `medium` / `low` |
| `due_date` | 期限 | TEXT | 不可 | `''` | YYYY-MM-DD。空は期限なし |
| `status` | 状態 | TEXT | 不可 | `todo` | `todo`（未着手）/ `doing`（進行中）/ `done`（完了） |
| `sort_order` | 列の中の並び | INTEGER | 不可 | 0 | ボードの状態の列の中の並び。小さいほど上（FN0602-BR04） |
| `created_at` | 作った日時 | TEXT | 不可 | CURRENT_TIMESTAMP | UTC |
| `updated_at` | 変えた日時 | TEXT | 不可 | CURRENT_TIMESTAMP | UTC |
| `completed_at` | 完了にした日時 | TEXT | 不可 | `''` | UTC。完了でなければ空 |
| `repeat` | 繰り返し | TEXT | 不可 | `''` | `''`（なし）/ `daily` / `weekdays` / `weekly` / `monthly`（FN0602-BR10） |
| `parent_id` | WBS の親 | TEXT | 不可 | `''` | 親のタスク ID。空なら一番上（FN0602-BR14） |
| `start_date` | 開始日 | TEXT | 不可 | `''` | YYYY-MM-DD |
| `wbs_order` | WBS の並び | INTEGER | 不可 | 0 | 同じ親の中の並び。小さいほど上 |

## 3. キー・インデックス

| 種類 | カラム | 目的 |
|---|---|---|
| PK | `task_id` | - |
| INDEX | `user_id`, `status`, `sort_order` | 本人のタスクを列ごとに並べて引く |

## 4. 他テーブルとの関係

| カラム | 参照先 | 参照先が削除されたとき |
|---|---|---|
| `user_id` | TBL0101 user | ユーザーを消すと、その人のタスクも消す（FN0602-BR07） |
| `parent_id` | TBL0602 task（自分の表） | 親を消すと、子は親のいた位置へ繰り上げる |

## 5. ライフサイクル

| タイミング | きっかけ（API・バッチの ID） | 内容 |
|---|---|---|
| 作成 | API0608・API0609 | 作ったとき。繰り返しのタスクを完了にしたら次の回を作る |
| 更新 | API0609・API0610・API0611 | 変えた・並べ替えた・WBS の中で動かした |
| 削除 | API0612・API0613・API0108 | 消した・完了をまとめて消した・ユーザーを消した |

## 6. 未決事項

-
