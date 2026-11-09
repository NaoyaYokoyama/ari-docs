---
id: TBL0601
title: お気に入り
type: テーブル
status: レビュー中
related: [FN0601, TBL0101, TBL0301, TBL0401, TBL0501]
updated: 2026-10-30
---

# TBL0601 お気に入り

## 1. 概要

| 項目 | 値 |
|---|---|
| 物理名 | `favorite` |
| 概要 | お気に入り。1 行がノード・Note・Wiki のいずれか 1 つを指す（FN0601-BR01）。 |
| 定義（正） | `back/src/data/migration/T005_create_favorite.sql` |

## 2. カラム

| 物理名 | 論理名 | 型 | NULL | 既定値 | 意味・値のルール |
|---|---|---|---|---|---|
| `favorite_id` | お気に入り ID | TEXT | 不可 | - | `fv_` で始まる ID |
| `user_id` | ユーザー ID | TEXT | 不可 | - | 登録したユーザー（`local`） |
| `node_id` | ノード ID | TEXT | 不可 | - | ノードのお気に入りのとき `node.node_id`。それ以外は空文字 |
| `note_id` | Note ID | TEXT | 不可 | - | Note のお気に入りのとき `note.note_id`。それ以外は空文字 |
| `wiki_id` | Wiki ID | TEXT | 不可 | - | Wiki のお気に入りのとき `wiki.wiki_id`。それ以外は空文字 |

## 3. キー・インデックス

| 種類 | カラム | 目的 |
|---|---|---|
| PK | `favorite_id` | - |

## 4. 他テーブルとの関係

| カラム | 参照先 | 参照先が削除されたとき |
|---|---|---|
| `user_id` | TBL0101 user | 行は残る |
| `node_id` | TBL0301 node | 行は残る（一覧には表示されない） |
| `note_id` | TBL0401 note | 行を削除する（FN0401-BR08） |
| `wiki_id` | TBL0501 wiki | 行を削除する（FN0501-BR04） |

## 5. ライフサイクル

| タイミング | きっかけ（API・バッチの ID） | 内容 |
|---|---|---|
| 作成 | API0602、API0603、API0604 | お気に入り登録 |
| 更新 | - | 更新しない |
| 削除 | API0605 | お気に入り解除 |
| 削除 | API0404 | Note 削除時に、その Note のお気に入りを削除 |
| 削除 | API0504 | Wiki 削除時に、その Wiki のお気に入りを削除 |

## 6. 未決事項

- `(user_id, node_id, note_id, wiki_id)` の一意制約を付けるか（二重登録は登録 API で防いでいる。FN0601-BR07）
