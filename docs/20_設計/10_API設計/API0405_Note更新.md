---
id: API0405
title: Note 更新
type: API
status: レビュー中
related: [FN0401, TBL0401, FN0402, TBL0402]
updated: 2026-10-30
---

# API0405 Note 更新

## 1. 概要

Note のタイトルと本文を更新する。

## 2. エンドポイント

| 項目 | 値 |
|---|---|
| メソッド | POST |
| パス | `/api/note/update` |
| 認証 | 不要（ユーザー `local` として処理する。FN0101-BR01） |
| 権限 | 利用者 |
| 実装 | `back/src/api/note/handler.rs` |

## 3. リクエスト

| 名前 | 場所 | 型 | 必須 | 説明・制約 |
|---|---|---|---|---|
| noteId | body | string | ○ | Note の ID |
| title | body | string | ○ | タイトル。前後の空白を除いて空でないこと、25 文字以内（FN0401-BR03） |
| content | body | string | ○ | 本文（Markdown） |
| baseUpdatedAt | body | string | - | 開いたとき（または前に保存したとき）の更新日時。今の更新日時と違えば 409（無ければ確かめない。FN0402-BR05） |
| force | body | boolean | - | true なら食い違っていても上書きする（既定 false） |

例:

```json
{
  "noteId": "nt_XXXX",
  "title": "設計メモ",
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
  "message": "メモを更新しました。",
  "data": null
}
```

### 4.2 エラー時

| ステータス | 条件 |
|---|---|
| 400 | タイトルが空、または 25 文字を超える（文言は API0403 と同じ。FN0401-BR03） |
| 401 | ユーザー `local` が DB に無い（FN0101-BR02） |
| 404 | 対象が無い（削除された） |
| 409 | 開いたあとにほかの人（Note はほかの画面）が更新した。`message` に確認の文言（MSG0516 など。FN0402-BR05） |
| 500 | DB・ファイル操作の失敗 |

## 5. 処理

1. タイトルを検証する（FN0401-BR03）。
2. 今の版を読み、`baseUpdatedAt` と更新日時が違って `force` でなければ 409 にする（FN0402-BR05）。
3. `user_id` がユーザー `local` かつ `note_id` が一致する Note を更新し、`updated_at` を現在日時にする（FN0401-BR05）。
4. 版が無ければ保存する前の版を、続けて保存したあとの版を TBL0402 に残す（FN0402-BR01・BR02）。

## 6. 関連

| 種類 | ID | 名称 |
|---|---|---|
| 機能要件 | FN0401 | Note |
| テーブル | TBL0401 | Note |

## 7. 未決事項

-
