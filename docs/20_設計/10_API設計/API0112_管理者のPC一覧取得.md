---
id: API0112
title: 管理者のPC一覧取得
type: API
status: レビュー中
related: [FN0102, TBL0106, SCR0701]
updated: 2026-11-23
---

# API0112 管理者のPC一覧取得

## 1. 概要

登録した管理者の PC（すべての管理者の分）を返す（共有モード。FN0102-BR12）。

## 2. エンドポイント

| 項目 | 値 |
|---|---|
| メソッド | GET |
| パス | `/api/admin-devices` |
| 認証 | 要（共有モード） |
| 権限 | 管理者（登録した PC から） |
| 実装 | `back/src/api/admin_device.rs` の `get_devices` |

## 3. リクエスト

なし（この PC の鍵は `X-Ari-Device` ヘッダーで届く）

## 4. レスポンス

### 4.1 成功時

| ステータス | 内容 |
|---|---|
| 200 | `[{"deviceId", "userId", "displayName", "name", "createdAt", "lastUsedAt", "current"}]`。`name` は端末の名前（例: Windows・デスクトップアプリ）、`current` は今使っている PC。管理者のユーザー ID・登録した順 |

### 4.2 エラー時

| ステータス | 条件 |
|---|---|
| 401 | 未ログイン |
| 403 | ローカルモード、管理者でない、登録していない PC から使っている |

## 5. 処理

1. 管理者（登録した PC から）であることを確かめる。
2. `admin_device`（TBL0106）を読み、届いた鍵の SHA-256 と同じものに `current` を付ける。鍵そのもの・SHA-256 は返さない。

## 6. 関連

| 種類 | ID | 名称 |
|---|---|---|
| 機能要件 | FN0102 | ユーザー管理 |
| 画面 | SCR0701 | 設定 |
| テーブル | TBL0106 | admin_device |

## 7. 未決事項

-
