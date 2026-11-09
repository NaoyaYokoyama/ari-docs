---
id: API0401
title: Note 一覧取得
type: API
status: レビュー中
related: [FN0401, TBL0401]
updated: 2026-10-30
---

# API0401 Note 一覧取得

## 1. 概要

Note の一覧を返す。

## 2. エンドポイント

| 項目 | 値 |
|---|---|
| メソッド | GET |
| パス | `/api/notes` |
| 認証 | 不要（ユーザー `local` として処理する。FN0101-BR01） |
| 権限 | 利用者 |
| 実装 | `back/src/api/note/handler.rs` |

## 3. リクエスト

-

## 4. レスポンス

### 4.1 成功時

| ステータス | 内容 |
|---|---|
| 200 | 取得成功 |

| 名前 | 型 | 説明 |
|---|---|---|
| notes[] | array | Note。タイトル昇順、すべて（FN0401-BR01） |
| notes[].noteId | string | Note の ID（`nt_` で始まる） |
| notes[].title | string | タイトル |
| notes[].content | string | 本文（Markdown）（一覧では空文字） |
| notes[].updatedAt | string | 更新日時（`YYYY-MM-DD HH:MM:SS`、UTC） |
| notes[].favoriteId | string | お気に入り ID。未登録なら空文字（一覧では空文字） |

例:

```json
{
  "notes": [
    {
      "noteId": "nt_XXXX",
      "title": "設計メモ",
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

1. `user_id` がユーザー `local` の Note を、タイトル昇順ですべて取得する。

## 6. 関連

| 種類 | ID | 名称 |
|---|---|---|
| 機能要件 | FN0401 | Note |
| テーブル | TBL0401 | Note |

## 7. 未決事項

-
