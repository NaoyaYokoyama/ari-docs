---
id: API0411
title: Note・Wiki のフォルダ削除
type: API
status: レビュー中
related: [FN0403, TBL0403, TBL0404]
updated: 2026-10-30
---

# API0411 Note・Wiki のフォルダ削除

## 1. 概要

中が空のフォルダを削除する（FN0403-BR05）。

## 2. エンドポイント

| 項目 | 値 |
|---|---|
| メソッド | POST |
| パス | `/api/content-folders/delete` |
| 認証 | 要（ローカルモードはユーザー `local`） |
| 権限 | 利用者（Note のフォルダは本人のものだけ） |
| 実装 | `back/src/api/content_folder/handler.rs` の `delete_folder` |

## 3. リクエスト

| 名前 | 場所 | 型 | 必須 | 説明・制約 |
|---|---|---|---|---|
| kind | body | string | ○ | `note` / `wiki`。ほかは 400 |
| folderId | body | string | ○ | フォルダの ID |

## 4. レスポンス

### 4.1 成功時

| ステータス | 内容 |
|---|---|
| 200 | 成功 |

| 名前 | 型 | 説明 |
|---|---|---|
| message | string | 結果の文言 |

### 4.2 エラー時

| ステータス | 条件 |
|---|---|
| 401 | 未ログイン |
| 400 | kind が正しくない |
| 404 | フォルダが無い・本人の Note のフォルダでない（MSG0422） |
| 409 | 中にフォルダ・Note・Wiki がある（MSG0419） |

## 5. 処理

1. フォルダがあり、中が空かを確かめて削除する。

## 6. 関連

| 種類 | ID | 名称 |
|---|---|---|
| 機能要件 | FN0403 | Note・Wiki のフォルダ |
| テーブル | TBL0403 | Note・Wiki のフォルダ |
| テーブル | TBL0404 | Note・Wiki の入れ場所 |

## 7. 未決事項

-
