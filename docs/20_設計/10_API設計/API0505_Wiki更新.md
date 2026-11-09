---
id: API0505
title: Wiki 更新
type: API
status: レビュー中
related: [FN0501, TBL0501, FN0402, TBL0402]
updated: 2026-10-30
---

# API0505 Wiki 更新

## 1. 概要

Wiki のタイトルと本文を更新する。

## 2. エンドポイント

| 項目 | 値 |
|---|---|
| メソッド | POST |
| パス | `/api/wiki/update` |
| 認証 | 不要（ユーザー `local` として処理する。FN0101-BR01） |
| 権限 | 利用者 |
| 実装 | `back/src/api/wiki/handler.rs` |

## 3. リクエスト

| 名前 | 場所 | 型 | 必須 | 説明・制約 |
|---|---|---|---|---|
| wikiId | body | string | ○ | Wiki の ID |
| title | body | string | ○ | タイトル。前後の空白を除いて空でないこと、25 文字以内（FN0501-BR02） |
| content | body | string | ○ | 本文（Markdown） |
| baseUpdatedAt | body | string | - | 開いたとき（または前に保存したとき）の更新日時。今の更新日時と違えば 409（無ければ確かめない。FN0402-BR05） |
| force | body | boolean | - | true なら食い違っていても上書きする（既定 false） |

例:

```json
{
  "wikiId": "wk_XXXX",
  "title": "開発ルール",
  "content": "# 見出し"
}
```

## 4. レスポンス

### 4.1 成功時

| ステータス | 内容 |
|---|---|
| 200 | 更新成功。`data.updatedAt` に保存したあとの更新日時（次の保存の `baseUpdatedAt` に使う） |

| 名前 | 型 | 説明 |
|---|---|---|
| message | string | 処理結果のメッセージ |
| data | null | なし |

例:

```json
{
  "message": "Wikiを更新しました。",
  "data": null
}
```

### 4.2 エラー時

| ステータス | 条件 |
|---|---|
| 400 | タイトルが空（「タイトルを入力してください。」）、または 25 文字を超える（「タイトルは25文字以内で入力してください。」）。FN0501-BR02 |
| 401 | ユーザー `local` が DB に無い（FN0101-BR02） |
| 404 | 対象が無い（削除された） |
| 409 | 開いたあとにほかの人（Note はほかの画面）が更新した。`message` に確認の文言（MSG0516 など。FN0402-BR05） |
| 500 | DB・ファイル操作の失敗 |

## 5. 処理

1. タイトルを検証する（FN0501-BR02）。
2. 今の版を読み、`baseUpdatedAt` と更新日時が違って `force` でなければ 409 にする（FN0402-BR05）。
3. `wiki_id` が一致する Wiki を更新し（Wiki は `updated_by` も。FN0501-BR09）、`updated_at` を現在日時にする（FN0501-BR05）。
4. 版が無ければ保存する前の版を、続けて保存したあとの版を TBL0402 に残す（FN0402-BR01・BR02）。

## 6. 関連

| 種類 | ID | 名称 |
|---|---|---|
| 機能要件 | FN0501 | Wiki |
| テーブル | TBL0501 | Wiki |

## 7. 未決事項

- 最終更新者の記録（RQ0502）
- 更新時のタイトル検証
