---
id: TBL0901
title: バックアップ
type: テーブル
status: レビュー中
related: [FN0901, TBL0101]
updated: 2026-10-30
---

# TBL0901 バックアップ

## 1. 概要

| 項目 | 値 |
|---|---|
| 物理名 | `backup` |
| 概要 | バックアップの記録（FN0901）。実体は `<dir>/<file_name>`。復元しても今の中身を残す（FN0901-BR06） |
| 定義（正） | `back/src/data/migration/T010_create_trash_backup.sql` |

## 2. カラム

| 物理名 | 論理名 | 型 | NULL | 既定値 | 意味・値のルール |
|---|---|---|---|---|---|
| `backup_id` | バックアップ ID | TEXT | 不可 | - | `bk_` で始まる |
| `file_name` | ファイル名 | TEXT | 不可 | - | `ari-docs_<YYYYMMDD_HHMMSS>_<kind>.zip`（ローカル時刻） |
| `dir` | 保存先 | TEXT | 不可 | - | 作ったときの保存先の絶対パス（あとで保存先を変えても前のものを扱えるように） |
| `size` | サイズ | INTEGER | 不可 | 0 | バイト |
| `kind` | 種類 | TEXT | 不可 | - | `auto`（定期）/ `manual`（手動）/ `before_restore`（復元の前） |
| `period` | 期間 | TEXT | 不可 | '' | 定期のときの期間（`YYYY-MM-DD` / `YYYY-Www` / `YYYY-MM`）。同じ期間に 2 回取らないため（FN0901-BR04） |
| `created_by` | 作った人 | TEXT | 不可 | - | ユーザー ID。定期は `system` |
| `created_at` | 作った日時 | TEXT | 不可 | CURRENT_TIMESTAMP | UTC |

## 3. キー・インデックス

| 種類 | カラム | 目的 |
|---|---|---|
| PK | `backup_id` | - |

## 4. 他テーブルとの関係

| カラム | 参照先 | 参照先が削除されたとき |
|---|---|---|
| `created_by` | TBL0101 user | 行は残る |

## 5. ライフサイクル

| タイミング | きっかけ（API・バッチの ID） | 内容 |
|---|---|---|
| 作成 | API0904・API0906・BAT0901 | 手動・復元の前・定期 |
| 削除 | API0905・BAT0901 | 手動の削除・保存期間を過ぎた定期と復元の前のもの |

## 6. 未決事項

-
