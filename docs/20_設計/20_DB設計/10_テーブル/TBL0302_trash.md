---
id: TBL0302
title: ゴミ箱
type: テーブル
status: レビュー中
related: [FN0302, TBL0101]
updated: 2026-10-30
---

# TBL0302 ゴミ箱

## 1. 概要

| 項目 | 値 |
|---|---|
| 物理名 | `trash` |
| 概要 | ゴミ箱に入れたファイル・フォルダ（FN0302）。実体は `<データのフォルダ>/trash/<trash_id>/<name>`。バックアップから復元しても今の中身を残す（FN0901-BR06） |
| 定義（正） | `back/src/data/migration/T010_create_trash_backup.sql` |

## 2. カラム

| 物理名 | 論理名 | 型 | NULL | 既定値 | 意味・値のルール |
|---|---|---|---|---|---|
| `trash_id` | ゴミ箱 ID | TEXT | 不可 | - | `tr_` で始まる |
| `original_path` | 元の場所 | TEXT | 不可 | - | `folder/` からの相対パス |
| `name` | 名前 | TEXT | 不可 | - | 元の名前 |
| `node_type` | 種類 | TEXT | 不可 | - | `folder` / `file` |
| `size` | サイズ | INTEGER | 不可 | 0 | バイト。フォルダは中身の合計 |
| `deleted_by` | 削除した人 | TEXT | 不可 | - | ユーザー ID |
| `deleted_at` | 削除した日時 | TEXT | 不可 | CURRENT_TIMESTAMP | UTC |

## 3. キー・インデックス

| 種類 | カラム | 目的 |
|---|---|---|
| PK | `trash_id` | - |

## 4. 他テーブルとの関係

| カラム | 参照先 | 参照先が削除されたとき |
|---|---|---|
| `deleted_by` | TBL0101 user | 行は残る（画面にはユーザー ID を出す） |

## 5. ライフサイクル

| タイミング | きっかけ（API・バッチの ID） | 内容 |
|---|---|---|
| 作成 | API0303 | 削除したとき |
| 削除 | API0314 | 元に戻したとき |
| 削除 | API0315・API0316・BAT0901 | 完全に削除・空にする・保存期間を過ぎたとき |

## 6. 未決事項

-
