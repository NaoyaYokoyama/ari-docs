---
id: API0703
title: Docs 初期フォルダ変更
type: API
status: レビュー中
related: [FN0701, TBL0701]
updated: 2026-10-11
---

# API0703 Docs 初期フォルダ変更

## 1. 概要

Docs（Markdown ビューア）の初期フォルダを変更する。空文字を送ると解除する。

## 2. エンドポイント

| 項目 | 値 |
|---|---|
| メソッド | POST |
| パス | `/api/setting/update/docs-root` |
| 認証 | 不要（ユーザー `local` として処理する。FN0101-BR01） |
| 権限 | 利用者（ローカルモードのみ。FN0701-BR04） |
| 実装 | `back/src/api/setting/handler.rs` |

## 3. リクエスト

| 名前 | 場所 | 型 | 必須 | 説明・制約 |
|---|---|---|---|---|
| docsRoot | body | string | ○ | 初期フォルダの絶対パス。存在するフォルダであること（FN0701-BR02）。空文字なら解除（FN0701-BR03） |

例:

```json
{
  "docsRoot": "/home/user/project/docs"
}
```

## 4. レスポンス

### 4.1 成功時

| ステータス | 内容 |
|---|---|
| 200 | 変更・解除に成功 |

| 名前 | 型 | 説明 |
|---|---|---|
| message | string | MSG0702（変更）または MSG0704（解除） |
| data.docsRoot | string | 保存した初期フォルダ（正規化した絶対パス）。解除なら空文字 |
| data.defaultRoot | string | 未設定のときに表示するフォルダの絶対パス |

例:

```json
{
  "message": "Docs の初期フォルダを変更しました",
  "data": {
    "docsRoot": "/home/user/project/docs",
    "defaultRoot": "/home/user/ari-docs/docs"
  }
}
```

### 4.2 エラー時

本文は `{"message": "<メッセージ>", "data": null}`。

| ステータス | 条件 |
|---|---|
| 400 | `docsRoot` が存在しない、またはフォルダではない（MSG0703） |
| 401 | ユーザー `local` が DB に無い（FN0101-BR02） |
| 403 | 共有モード（MSG0705） |
| 500 | DB の失敗 |

## 5. 処理

1. 共有モードなら 403 を返す（FN0701-BR04）。
2. `docsRoot` の前後の空白を除く。空なら空文字を保存する（解除）。
3. 空でなければ、存在するフォルダかを確かめ、正規化した絶対パスにする（FN0701-BR02）。
4. `user_setting` に保存する（行が無ければ作り、あれば `docs_root` と `updated_at` を更新する）。

## 6. 関連

| 種類 | ID | 名称 |
|---|---|---|
| 機能要件 | FN0701 | ユーザー設定 |
| テーブル | TBL0701 | ユーザー設定 |

## 7. 未決事項

-
