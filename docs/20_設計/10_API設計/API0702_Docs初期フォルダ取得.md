---
id: API0702
title: Docs 初期フォルダ取得
type: API
status: レビュー中
related: [FN0701, TBL0701]
updated: 2026-10-11
---

# API0702 Docs 初期フォルダ取得

## 1. 概要

Docs（Markdown ビューア）の初期フォルダの設定と、未設定のときに表示するフォルダを返す。

## 2. エンドポイント

| 項目 | 値 |
|---|---|
| メソッド | GET |
| パス | `/api/setting/docs-root` |
| 認証 | 不要（ユーザー `local` として処理する。FN0101-BR01） |
| 権限 | 利用者 |
| 実装 | `back/src/api/setting/handler.rs` |

## 3. リクエスト

-

## 4. レスポンス

### 4.1 成功時

| ステータス | 内容 |
|---|---|
| 200 | 取得成功 |

| 名前 | 型 | 説明 |
|---|---|---|
| docsRoot | string | 設定した初期フォルダの絶対パス。未設定なら空文字 |
| defaultRoot | string | 未設定のときに表示する既定のフォルダの絶対パス（FN0801-BR01） |

例:

```json
{
  "docsRoot": "/home/user/project/docs",
  "defaultRoot": "/home/user/ari-docs/docs"
}
```

### 4.2 エラー時

| ステータス | 条件 |
|---|---|
| 401 | ユーザー `local` が DB に無い（FN0101-BR02） |
| 500 | DB・ファイル操作の失敗 |

## 5. 処理

1. `user_setting` からユーザー `local` の `docs_root` を取得する（行が無ければ空文字）。
2. リポジトリの `docs/` の絶対パスとあわせて返す。

## 6. 関連

| 種類 | ID | 名称 |
|---|---|---|
| 機能要件 | FN0701 | ユーザー設定 |
| テーブル | TBL0701 | ユーザー設定 |

## 7. 未決事項

-
