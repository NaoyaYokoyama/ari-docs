---
id: API0326
title: Officeのファイルのプレビュー
type: API
status: レビュー中
related: [FN0301, SCR0301]
updated: 2026-11-28
---

# API0326 Officeのファイルのプレビュー

## 1. 概要

Excel・Word・PowerPoint のファイルの文字とセルの値を返す（Folder のプレビュー。FN0301-BR41）。色・罫線・図・画像は返さない

## 2. エンドポイント

| 項目 | 値 |
|---|---|
| メソッド | GET |
| パス | `/api/nodes/preview-office?path={path}` |
| 認証 | 要（ローカルモードはユーザー `local`） |
| 権限 | 利用者 |
| 実装 | `back/src/api/node/handler.rs` |

## 3. リクエスト

| 名前 | 場所 | 型 | 必須 | 説明・制約 |
|---|---|---|---|---|
| path | query | string | ○ | ファイルのパス。拡張子が Excel（xlsx・xlsm・xlsb・xls・ods）・Word（docx・docm・doc）・PowerPoint（pptx・pptm・ppt）のもの。古い doc・ppt は文字だけ（FN0202-BR18 と同じ取り出し） |

## 4. レスポンス

### 4.1 成功時

| 名前 | 型 | 説明 |
|---|---|---|
| type | string | `sheets` / `document` / `slides` |
| sheets[] | array | （sheets）シートの名前 `name`・行 `rows`（セルの文字の 2 次元の配列）・`truncated`（500 行・50 列で切った） |
| moreSheets | boolean | （sheets）30 シートより多い |
| text | string | （document）本文。段落ごとに改行、表の行は「セル | セル」 |
| slides | string[] | （slides）スライドの番号の順の文字 |
| truncated | boolean | （document・slides）20 万文字・300 枚で切った |

### 4.2 エラー時

| ステータス | 条件 |
|---|---|
| 400 | Office のファイルでない |
| 401 | 未ログイン |
| 404 | ファイルが無い |
| 422 | 30 MB より大きい・壊れている・読めない形（`message` に理由） |
| 503 | 順番を待てなかった |

## 5. 処理

1. ファイルを確かめる（ダウンロードと同じ。`file_for_download`）。
2. サーバーが重くならないよう、同時に作るのは 2 つまでにする（ほかは順番を待つ）。
3. Excel はセルの値（日付は YYYY-MM-DD）、Word は段落と表、PowerPoint はスライドごとの文字を取り出す。セルは 300 文字で切る。

## 6. 関連

| 種類 | ID | 名称 |
|---|---|---|
| 機能要件 | FN0301 | フォルダ |
| 画面 | SCR0301 | フォルダ |

## 7. 未決事項

-
