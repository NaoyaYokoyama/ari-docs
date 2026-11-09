---
id: API0408
title: Note・Wiki のフォルダ一覧取得
type: API
status: レビュー中
related: [FN0403, TBL0403, TBL0404]
updated: 2026-10-30
---

# API0408 Note・Wiki のフォルダ一覧取得

## 1. 概要

Note・Wiki のフォルダと、フォルダに入っている Note・Wiki の場所を返す（FN0403-BR02）。Note は本人のフォルダだけ。

## 2. エンドポイント

| 項目 | 値 |
|---|---|
| メソッド | GET |
| パス | `/api/content-folders/{kind}` |
| 認証 | 要（ローカルモードはユーザー `local`） |
| 権限 | 利用者（Note のフォルダは本人のものだけ） |
| 実装 | `back/src/api/content_folder/handler.rs` の `get_folders` |

## 3. リクエスト

| 名前 | 場所 | 型 | 必須 | 説明・制約 |
|---|---|---|---|---|
| kind | path | string | ○ | `note` / `wiki`。ほかは 400 |

## 4. レスポンス

### 4.1 成功時

| ステータス | 内容 |
|---|---|
| 200 | 成功 |

| 名前 | 型 | 説明 |
|---|---|---|
| folders | array | フォルダ（名前順） |
| folders[].folderId | string | フォルダの ID |
| folders[].parentId | string | 親のフォルダ。空なら一番上 |
| folders[].name | string | 名前 |
| items | array | フォルダに入っている Note・Wiki（一番上にあるものは含まない） |
| items[].itemId | string | `note_id` / `wiki_id` |
| items[].folderId | string | 入っているフォルダ |

### 4.2 エラー時

| ステータス | 条件 |
|---|---|
| 401 | 未ログイン |
| 400 | kind が正しくない |

## 5. 処理

1. フォルダと入れ場所を読み、Note なら本人のフォルダのものだけを返す。

## 6. 関連

| 種類 | ID | 名称 |
|---|---|---|
| 機能要件 | FN0403 | Note・Wiki のフォルダ |
| テーブル | TBL0403 | Note・Wiki のフォルダ |
| テーブル | TBL0404 | Note・Wiki の入れ場所 |

## 7. 未決事項

-
