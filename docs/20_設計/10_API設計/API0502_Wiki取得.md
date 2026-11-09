---
id: API0502
title: Wiki 取得
type: API
status: レビュー中
related: [FN0501, TBL0601, TBL0501]
updated: 2026-10-30
---

# API0502 Wiki 取得

## 1. 概要

Wiki を 1 件、お気に入りの状態付きで返す。

## 2. エンドポイント

| 項目 | 値 |
|---|---|
| メソッド | GET |
| パス | `/api/wiki/{wikiId}` |
| 認証 | 不要（ユーザー `local` として処理する。FN0101-BR01） |
| 権限 | 利用者 |
| 実装 | `back/src/api/wiki/handler.rs` |

## 3. リクエスト

| 名前 | 場所 | 型 | 必須 | 説明・制約 |
|---|---|---|---|---|
| wikiId | path | string | ○ | Wiki の ID |

## 4. レスポンス

### 4.1 成功時

| ステータス | 内容 |
|---|---|
| 200 | 取得成功 |

| 名前 | 型 | 説明 |
|---|---|---|
| wikiId | string | Wiki の ID（`wk_` で始まる） |
| title | string | タイトル |
| content | string | 本文（Markdown） |
| updatedBy | string | 最後に更新した人の表示名（まだ誰も更新していなければ作成者。FN0501-BR09） |
| updatedAt | string | 更新日時（`YYYY-MM-DD HH:MM:SS`、UTC） |
| favoriteId | string | お気に入り ID。未登録なら空文字 |

例:

```json
{
  "wikiId": "wk_XXXX",
  "title": "開発ルール",
  "content": "# 見出し",
  "updatedAt": "2026-10-11 00:00:00",
  "favoriteId": ""
}
```

### 4.2 エラー時

| ステータス | 条件 |
|---|---|
| 401 | ユーザー `local` が DB に無い（FN0101-BR02） |
| 500 | 存在しない Wiki |

## 5. 処理

1. `wiki_id` が一致する Wiki を取得する。
2. その Wiki のお気に入りを探し、`favoriteId` を付ける。

## 6. 関連

| 種類 | ID | 名称 |
|---|---|---|
| 機能要件 | FN0501 | Wiki |
| テーブル | TBL0601 | お気に入り |
| テーブル | TBL0501 | Wiki |

## 7. 未決事項

- 見つからないときは 404 が適切か
