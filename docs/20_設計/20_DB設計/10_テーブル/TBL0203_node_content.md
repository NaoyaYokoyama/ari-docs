---
id: TBL0203
title: 取り込みの状態
type: テーブル
status: レビュー中
related: [FN0202, TBL0301, BAT0302]
updated: 2026-11-08
---

# TBL0203 取り込みの状態

## 1. 概要

| 項目 | 値 |
|---|---|
| 物理名 | `node_content` |
| 概要 | ファイル（ノード）ごとの、中身を取り込んだときの状態（FN0202）。変わったかを比べて、変わったものだけを取り込み直す |
| 定義（正） | `back/src/data/migration/T009_create_search_index.sql` |

## 2. カラム

| 物理名 | 論理名 | 型 | NULL | 既定値 | 意味・値のルール |
|---|---|---|---|---|---|
| `node_id` | ノード ID | TEXT | 不可 | - | TBL0301 の `node_id` |
| `modified_at` | 更新日時 | INTEGER | 不可 | - | 取り込んだときのファイルの更新日時（UNIX 時間の秒） |
| `size` | サイズ | INTEGER | 不可 | - | 取り込んだときのファイルのサイズ（バイト） |
| `status` | 状態 | TEXT | 不可 | - | `indexed`（取り込み済み）/ `too_large`（大きすぎて対象外。FN0202-BR04）/ `error`（読めなかった。FN0202-BR13） |
| `message` | 原因 | TEXT | 不可 | '' | `error` のときの原因 |
| `dictionary_version` | 辞書の版 | INTEGER | 不可 | - | 取り込んだときの版。検索の辞書の版（TBL0204 の単語の一覧から FNV-1a で計算。FN0202-BR11）に、取り出し方の版と、文字認識したか（FN0202-BR15）を組み合わせたもの（`back/src/search/index.rs` の `file_version`） |
| `word_count` | 単語数 | INTEGER | 不可 | 0 | 登録した単語の数 |
| `indexed_at` | 取り込み日時 | TEXT | 不可 | CURRENT_TIMESTAMP | UTC |

## 3. キー・インデックス

| 種類 | カラム | 目的 |
|---|---|---|
| PK | `node_id` | 1 ファイル 1 行 |

## 4. 他テーブルとの関係

| カラム | 参照先 | 参照先が削除されたとき |
|---|---|---|
| `node_id` | TBL0301 node | 行は残る（次の取り込みでファイルが無ければ消す） |

## 5. ライフサイクル

| タイミング | きっかけ（API・バッチの ID） | 内容 |
|---|---|---|
| 作成・更新 | BAT0302 | 取り込んだ・取り込めなかったときに書く |
| 削除 | BAT0302 | ファイルが消えた・対象外になったときに消す |

## 6. 未決事項

-
