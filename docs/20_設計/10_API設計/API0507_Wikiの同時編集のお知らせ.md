---
id: API0507
title: Wikiの同時編集のお知らせ
type: API
status: レビュー中
related: [FN0501, SCR0501]
updated: 2026-11-28
---

# API0507 Wikiの同時編集のお知らせ

## 1. 概要

Wiki を書いている・やめたことを知らせ、ほかに書いている人と、今の Wiki の更新日時・最後に更新した人を返す（FN0501-BR11）。つなぎっぱなしにはせず、画面は未保存の変更がある間だけ、書き始めたときと 5 分ごとに呼ぶ。

## 2. エンドポイント

| 項目 | 値 |
|---|---|
| メソッド | POST |
| パス | `/api/wiki/editing` |
| 認証 | 必要（未ログインは 401） |
| 権限 | 利用者 |
| 実装 | `back/src/api/wiki/handler.rs` の `report_editing`・`back/src/service/editing.rs` |

## 3. リクエスト

| 名前 | 場所 | 型 | 必須 | 説明・制約 |
|---|---|---|---|---|
| wikiId | body | string | ○ | Wiki の ID |
| editing | body | boolean | ○ | `true` は書いている、`false` はやめた（保存した・ほかへ移った） |
| check | body | boolean | - | `true` なら確かめるだけ（開いたとき・読んでいる間。覚えている人を変えない） |
| release | body | boolean | - | `true` なら書いている人をすべて忘れる（管理者がロックを外す。FN0501-BR12） |

## 4. レスポンス

### 4.1 成功時

| 名前 | 型 | 説明 |
|---|---|---|
| editors | string[] | ほかに書いている人の表示名（自分は含めない） |
| updatedAt | string | 今の Wiki の更新日時 |
| updatedBy | string | 最後に更新した人の表示名 |
| lock | boolean | 書いている間はロックする設定か（共有モードでサーバーの設定の `wikiEditLock`） |
| lockedBy | string \| null | ロックしている人（自分のほか）の表示名 |
| lockedSince | string \| null | その人が書き始めた時刻（HH:MM） |

### 4.2 エラー時

| ステータス | 条件 |
|---|---|
| 401 | 未ログイン |
| 403 | `release` を管理者でない人が送った |
| 404 | Wiki が無い |

## 5. 処理

1. 書いている人をサーバーのメモリに覚える（Wiki ごと・人ごと。DB には残さない）。最後に知らせてから 10 分を過ぎた人は忘れる。
2. `editing` が `false` なら、その人を消す。Wiki を消したら、その Wiki の分を忘れる。
3. ロックの設定のときは、ほかの人が書いていれば `editing: true` でも覚えず、先に書き始めた人を `lockedBy` に返す（FN0501-BR12）。
4. ほかに書いている人と、Wiki の更新日時・最後に更新した人を返す。画面は更新日時が開いたときと違えば「○○さんが保存しました」を出す。

## 6. 関連

| 種類 | ID | 名称 |
|---|---|---|
| 機能要件 | FN0501 | Wiki |
| 画面 | SCR0501 | Wiki |

## 7. 未決事項

-
