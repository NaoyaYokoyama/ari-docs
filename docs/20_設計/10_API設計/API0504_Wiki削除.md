---
id: API0504
title: Wiki 削除
type: API
status: レビュー中
related: [FN0501, TBL0601, TBL0501]
updated: 2026-10-11
---

# API0504 Wiki 削除

## 1. 概要

Wiki と、その Wiki のお気に入りを削除する。

## 2. エンドポイント

| 項目 | 値 |
|---|---|
| メソッド | POST |
| パス | `/api/wiki/delete` |
| 認証 | 不要（ユーザー `local` として処理する。FN0101-BR01） |
| 権限 | 利用者 |
| 実装 | `back/src/api/wiki/handler.rs` |

## 3. リクエスト

| 名前 | 場所 | 型 | 必須 | 説明・制約 |
|---|---|---|---|---|
| wikiId | body | string | ○ | Wiki の ID |

例:

```json
{
  "wikiId": "wk_XXXX"
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
  "message": "Wikiを削除しました。",
  "data": null
}
```

### 4.2 エラー時

| ステータス | 条件 |
|---|---|
| 401 | ユーザー `local` が DB に無い（FN0101-BR02） |
| 500 | DB・ファイル操作の失敗 |

## 5. 処理

1. その Wiki のお気に入りを削除する（FN0501-BR04）。
2. `wiki_id` が一致する Wiki を削除する。

## 6. 関連

| 種類 | ID | 名称 |
|---|---|---|
| 機能要件 | FN0501 | Wiki |
| テーブル | TBL0601 | お気に入り |
| テーブル | TBL0501 | Wiki |

## 7. 未決事項

-
