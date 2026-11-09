---
id: API0402
title: Note 取得
type: API
status: レビュー中
related: [FN0401, TBL0601, TBL0401]
updated: 2026-10-11
---

# API0402 Note 取得

## 1. 概要

Note を 1 件、お気に入りの状態付きで返す。

## 2. エンドポイント

| 項目 | 値 |
|---|---|
| メソッド | GET |
| パス | `/api/note/{noteId}` |
| 認証 | 不要（ユーザー `local` として処理する。FN0101-BR01） |
| 権限 | 利用者 |
| 実装 | `back/src/api/note/handler.rs` |

## 3. リクエスト

| 名前 | 場所 | 型 | 必須 | 説明・制約 |
|---|---|---|---|---|
| noteId | path | string | ○ | Note の ID |

## 4. レスポンス

### 4.1 成功時

| ステータス | 内容 |
|---|---|
| 200 | 取得成功 |

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
  "content": "# 見出し",
  "updatedAt": "2026-10-11 00:00:00",
  "favoriteId": "fv_XXXX"
}
```

### 4.2 エラー時

| ステータス | 条件 |
|---|---|
| 401 | ユーザー `local` が DB に無い（FN0101-BR02） |
| 500 | 存在しない Note |

## 5. 処理

1. `user_id` がユーザー `local` かつ `note_id` が一致する Note を取得する。
2. その Note のお気に入りを探し、`favoriteId` を付ける。

## 6. 関連

| 種類 | ID | 名称 |
|---|---|---|
| 機能要件 | FN0401 | Note |
| テーブル | TBL0601 | お気に入り |
| テーブル | TBL0401 | Note |

## 7. 未決事項

- 見つからないときは 404 が適切か
