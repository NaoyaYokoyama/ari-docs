---
id: API0501
title: Wiki 一覧取得
type: API
status: レビュー中
related: [FN0501, TBL0501]
updated: 2026-10-30
---

# API0501 Wiki 一覧取得

## 1. 概要

Wiki の一覧を返す（`user_id` では絞り込まない。FN0501-BR01）。

## 2. エンドポイント

| 項目 | 値 |
|---|---|
| メソッド | GET |
| パス | `/api/wikis` |
| 認証 | 不要（ユーザー `local` として処理する。FN0101-BR01） |
| 権限 | 利用者 |
| 実装 | `back/src/api/wiki/handler.rs` |

## 3. リクエスト

-

## 4. レスポンス

### 4.1 成功時

| ステータス | 内容 |
|---|---|
| 200 | 取得成功 |

| 名前 | 型 | 説明 |
|---|---|---|
| wikis[] | array | Wiki。タイトル昇順、すべて（FN0501-BR03） |
| wikis[].wikiId | string | Wiki の ID（`wk_` で始まる） |
| wikis[].title | string | タイトル |
| wikis[].content | string | 本文（Markdown）（一覧では空文字） |
| wikis[].updatedAt | string | 更新日時（`YYYY-MM-DD HH:MM:SS`、UTC） |
| wikis[].favoriteId | string | お気に入り ID。未登録なら空文字（一覧では空文字） |

例:

```json
{
  "wikis": [
    {
      "wikiId": "wk_XXXX",
      "title": "開発ルール",
      "content": "",
      "updatedAt": "2026-10-11 00:00:00",
      "favoriteId": ""
    }
  ]
}
```

### 4.2 エラー時

| ステータス | 条件 |
|---|---|
| 401 | ユーザー `local` が DB に無い（FN0101-BR02） |
| 500 | DB・ファイル操作の失敗 |

## 5. 処理

1. Wiki をタイトル昇順ですべて取得する。

## 6. 関連

| 種類 | ID | 名称 |
|---|---|---|
| 機能要件 | FN0501 | Wiki |
| テーブル | TBL0501 | Wiki |

## 7. 未決事項

-
