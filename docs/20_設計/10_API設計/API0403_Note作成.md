---
id: API0403
title: Note 作成
type: API
status: レビュー中
related: [FN0401, TBL0401]
updated: 2026-10-30
---

# API0403 Note 作成

## 1. 概要

Note を作成し、作成した Note を返す。

## 2. エンドポイント

| 項目 | 値 |
|---|---|
| メソッド | POST |
| パス | `/api/note/create` |
| 認証 | 不要（ユーザー `local` として処理する。FN0101-BR01） |
| 権限 | 利用者 |
| 実装 | `back/src/api/note/handler.rs` |

## 3. リクエスト

| 名前 | 場所 | 型 | 必須 | 説明・制約 |
|---|---|---|---|---|
| title | body | string | ○ | タイトル。前後の空白を除いて空でないこと、25 文字以内（FN0401-BR03） |

例:

```json
{
  "title": "設計メモ"
}
```

## 4. レスポンス

### 4.1 成功時

| ステータス | 内容 |
|---|---|
| 200 | 作成成功 |

| 名前 | 型 | 説明 |
|---|---|---|
| noteId | string | Note の ID（`nt_` で始まる） |
| title | string | タイトル |
| content | string | 本文（Markdown） |
| updatedAt | string | 更新日時（`YYYY-MM-DD HH:MM:SS`、UTC） |
| favoriteId | string | お気に入り ID。未登録なら空文字 |

例:

```json
{
  "noteId": "nt_XXXX",
  "title": "設計メモ",
  "content": "",
  "updatedAt": "2026-10-11 00:00:00",
  "favoriteId": ""
}
```

### 4.2 エラー時

| ステータス | 条件 |
|---|---|
| 400 | タイトルが空（`{"message": "タイトルを入力してください。", "data": null}`）、または 25 文字を超える（`タイトルは25文字以内で入力してください。`）。FN0401-BR03 |
| 401 | ユーザー `local` が DB に無い（FN0101-BR02） |
| 500 | DB・ファイル操作の失敗 |

## 5. 処理

1. タイトルを検証する（FN0401-BR03）。
2. `note_id` を発行し、本文を空文字で作成する（FN0401-BR04）。
3. 作成した Note を返す。

## 6. 関連

| 種類 | ID | 名称 |
|---|---|---|
| 機能要件 | FN0401 | Note |
| テーブル | TBL0401 | Note |
