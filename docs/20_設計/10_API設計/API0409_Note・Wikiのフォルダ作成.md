---
id: API0409
title: Note・Wiki のフォルダ作成
type: API
status: レビュー中
related: [FN0403, TBL0403, TBL0404]
updated: 2026-10-30
---

# API0409 Note・Wiki のフォルダ作成

## 1. 概要

フォルダを作る（FN0403-BR01・BR03）。

## 2. エンドポイント

| 項目 | 値 |
|---|---|
| メソッド | POST |
| パス | `/api/content-folders/create` |
| 認証 | 要（ローカルモードはユーザー `local`） |
| 権限 | 利用者（Note のフォルダは本人のものだけ） |
| 実装 | `back/src/api/content_folder/handler.rs` の `create_folder` |

## 3. リクエスト

| 名前 | 場所 | 型 | 必須 | 説明・制約 |
|---|---|---|---|---|
| kind | body | string | ○ | `note` / `wiki`。ほかは 400 |
| parentId | body | string | - | 親のフォルダ。空・無しなら一番上 |
| name | body | string | ○ | 前後の空白を除いて 1〜25 文字 |

## 4. レスポンス

### 4.1 成功時

| ステータス | 内容 |
|---|---|
| 200 | 成功 |

| 名前 | 型 | 説明 |
|---|---|---|
| message | string | 結果の文言 |
| data.folderId | string | 作ったフォルダの ID |

### 4.2 エラー時

| ステータス | 条件 |
|---|---|
| 401 | 未ログイン |
| 400 | kind が正しくない・名前が空・25 文字超 |
| 404 | 親のフォルダが無い（MSG0422） |
| 409 | 同じ場所に同じ名前がある（MSG0418） |

## 5. 処理

1. 親のフォルダがあるか、同じ場所に同じ名前が無いかを確かめる。
2. 作る（Note のフォルダは本人のもの、Wiki のフォルダは作成者を記録するだけ）。

## 6. 関連

| 種類 | ID | 名称 |
|---|---|---|
| 機能要件 | FN0403 | Note・Wiki のフォルダ |
| テーブル | TBL0403 | Note・Wiki のフォルダ |
| テーブル | TBL0404 | Note・Wiki の入れ場所 |

## 7. 未決事項

-
