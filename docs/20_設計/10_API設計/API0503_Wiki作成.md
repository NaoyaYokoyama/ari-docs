---
id: API0503
title: Wiki 作成
type: API
status: レビュー中
related: [FN0501, TBL0501]
updated: 2026-10-30
---

# API0503 Wiki 作成

## 1. 概要

Wiki を作成し、作成した Wiki を返す。作成者としてユーザー `local` を記録する。

## 2. エンドポイント

| 項目 | 値 |
|---|---|
| メソッド | POST |
| パス | `/api/wiki/create` |
| 認証 | 不要（ユーザー `local` として処理する。FN0101-BR01） |
| 権限 | 利用者 |
| 実装 | `back/src/api/wiki/handler.rs` |

## 3. リクエスト

| 名前 | 場所 | 型 | 必須 | 説明・制約 |
|---|---|---|---|---|
| title | body | string | ○ | タイトル。1 文字以上 20 文字以内で、前後の空白を除いて空でないこと（FN0501-BR02） |

例:

```json
{
  "title": "開発ルール"
}
```

## 4. レスポンス

### 4.1 成功時

| ステータス | 内容 |
|---|---|
| 200 | 作成成功 |

| 名前 | 型 | 説明 |
|---|---|---|
| wikiId | string | Wiki の ID（`wk_` で始まる） |
| title | string | タイトル |
| content | string | 本文（Markdown） |
| updatedAt | string | 更新日時（`YYYY-MM-DD HH:MM:SS`、UTC） |
| favoriteId | string | お気に入り ID。未登録なら空文字 |

例:

```json
{
  "wikiId": "wk_XXXX",
  "title": "開発ルール",
  "content": "",
  "updatedAt": "2026-10-11 00:00:00",
  "favoriteId": ""
}
```

### 4.2 エラー時

| ステータス | 条件 |
|---|---|
| 400 | タイトルの文字数違反。本文は `{"message": "Wiki名は1文字以上20文字以内で入力してください。", "data": null}` |
| 400 | タイトルが空白だけ。本文は `{"message": "タイトルを入力してください。", "data": null}` |
| 401 | ユーザー `local` が DB に無い（FN0101-BR02） |
| 500 | DB・ファイル操作の失敗 |

## 5. 処理

1. タイトルを検証する。
2. `wiki_id` を発行し、`user_id` にユーザー `local`、本文を空文字で作成する。
3. 作成した Wiki を返す。

## 6. 関連

| 種類 | ID | 名称 |
|---|---|---|
| 機能要件 | FN0501 | Wiki |
| テーブル | TBL0501 | Wiki |

## 7. 未決事項

-
