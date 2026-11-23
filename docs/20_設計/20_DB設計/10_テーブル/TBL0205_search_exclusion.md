---
id: TBL0205
title: 検索の対象外
type: テーブル
status: レビュー中
related: [FN0202, TBL0101, API0209, API0210, API0211, BAT0302]
updated: 2026-11-23
---

# TBL0205 検索の対象外

## 1. 概要

| 項目 | 値 |
|---|---|
| 物理名 | `search_exclusion` |
| 概要 | 検索に出さないフォルダ・ファイル（FN0202-BR16・BR17）。全員の対象外（`user_id` が空）は中身の取り込みもしない。本人だけの対象外は、その人の検索・探して開くの結果からだけ外す |
| 定義（正） | `back/src/data/migration/T018_create_search_exclusion.sql` |

## 2. カラム

| 物理名 | 論理名 | 型 | NULL | 既定値 | 意味・値のルール |
|---|---|---|---|---|---|
| `exclusion_id` | ID | TEXT | 不可 | - | `sx_` で始まる |
| `user_id` | 対象の人 | TEXT | 不可 | `''` | 空なら全員。ローカルモードは常に空 |
| `kind` | 指定の仕方 | TEXT | 不可 | - | `path`（Folder の一番上からのパス）/ `name`（名前の型） |
| `value` | 値 | TEXT | 不可 | - | 200 文字まで。パスは `/` 区切りで、前後の `/` を付けない。名前の型は `/` を含まない（FN0202-BR16） |
| `created_by` | 登録者 | TEXT | 不可 | - | 登録したユーザーの ID |
| `created_at` | 登録日時 | TEXT | 不可 | CURRENT_TIMESTAMP | UTC |

## 3. キー・インデックス

| 種類 | カラム | 目的 |
|---|---|---|
| PK | `exclusion_id` | - |
| UNIQUE | `user_id`, `kind`, `value` | 同じものを登録させない |

## 4. 他テーブルとの関係

| カラム | 参照先 | 参照先が削除されたとき |
|---|---|---|
| `user_id` | TBL0101 user | ユーザー削除（API0108）で、その人の行を消す |
| `created_by` | TBL0101 user | 行は残る（画面にはユーザー ID を出す） |

## 5. ライフサイクル

| タイミング | きっかけ（API・バッチの ID） | 内容 |
|---|---|---|
| 作成 | API0210 | 登録する |
| 削除 | API0211・API0108 | 削除する |

## 6. 未決事項

-
