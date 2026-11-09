---
id: API0404
title: Note 削除
type: API
status: レビュー中
related: [FN0401, TBL0601, TBL0401]
updated: 2026-10-11
---

# API0404 Note 削除

## 1. 概要

Note と、その Note のお気に入りを削除する。

## 2. エンドポイント

| 項目 | 値 |
|---|---|
| メソッド | POST |
| パス | `/api/note/delete` |
| 認証 | 不要（ユーザー `local` として処理する。FN0101-BR01） |
| 権限 | 利用者 |
| 実装 | `back/src/api/note/handler.rs` |

## 3. リクエスト

| 名前 | 場所 | 型 | 必須 | 説明・制約 |
|---|---|---|---|---|
| noteId | body | string | ○ | Note の ID |

例:

```json
{
  "noteId": "nt_XXXX"
}
```

## 4. レスポンス

### 4.1 成功時

| ステータス | 内容 |
|---|---|
| 200 | 削除成功（存在しない ID でも 200） |

| 名前 | 型 | 説明 |
|---|---|---|
| message | string | 処理結果のメッセージ |
| data | null | なし |

例:

```json
{
  "message": "メモを削除しました。",
  "data": null
}
```

### 4.2 エラー時

| ステータス | 条件 |
|---|---|
| 401 | ユーザー `local` が DB に無い（FN0101-BR02） |
| 500 | DB・ファイル操作の失敗 |

## 5. 処理

1. その Note のお気に入りを削除する（FN0401-BR08）。
2. `user_id` がユーザー `local` かつ `note_id` が一致する Note を削除する。

## 6. 関連

| 種類 | ID | 名称 |
|---|---|---|
| 機能要件 | FN0401 | Note |
| テーブル | TBL0601 | お気に入り |
| テーブル | TBL0401 | Note |

## 7. 未決事項

-
