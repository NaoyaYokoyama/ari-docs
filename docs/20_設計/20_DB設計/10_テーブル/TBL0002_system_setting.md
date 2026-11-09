---
id: TBL0002
title: システム設定
type: テーブル
status: レビュー中
related: [FN0902, FN0901, FN0302]
updated: 2026-11-08
---

# TBL0002 システム設定

## 1. 概要

| 項目 | 値 |
|---|---|
| 物理名 | `system_setting` |
| 概要 | 管理者が決める、全員に効く設定（FN0901・FN0902）。1 項目 1 行で、値は文字列（JSON）。行が無い項目は既定値を使う。復元しても今の中身を残す（FN0901-BR06） |
| 定義（正） | `back/src/data/migration/T010_create_trash_backup.sql` |

## 2. カラム

| 物理名 | 論理名 | 型 | NULL | 既定値 | 意味・値のルール |
|---|---|---|---|---|---|
| `key` | 項目 | TEXT | 不可 | - | 下の表 |
| `value` | 値 | TEXT | 不可 | - | 項目ごとの形 |
| `updated_at` | 更新日時 | TEXT | 不可 | CURRENT_TIMESTAMP | UTC |

| key | value | 内容 |
|---|---|---|
| `backup_settings` | JSON（`interval`・`hour`・`retentionDays`・`dir`・`trashRetentionDays`） | バックアップとゴミ箱の設定（FN0901-BR02） |
| `server_settings` | JSON（`sessionDays`・`maxFailures`・`lockMinutes`・`historyKeep`・`docsEnabled`） | ログインと保存の設定と Docs を使うか（FN0902-BR02、FN0902-BR06）。無い項目は既定値 |

## 3. キー・インデックス

| 種類 | カラム | 目的 |
|---|---|---|
| PK | `key` | 1 項目 1 行にする |

## 4. 他テーブルとの関係

| カラム | 参照先 | 参照先が削除されたとき |
|---|---|---|
| - | - | - |

## 5. ライフサイクル

| タイミング | きっかけ（API・バッチの ID） | 内容 |
|---|---|---|
| 作成・更新 | API0902 | 設定を保存したとき |
| 削除 | - | 削除しない |

## 6. 未決事項

-
