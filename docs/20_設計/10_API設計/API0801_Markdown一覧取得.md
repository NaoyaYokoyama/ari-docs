---
id: API0801
title: Markdown 一覧取得
type: API
status: レビュー中
related: [FN0801, TBL0701]
updated: 2026-11-08
---

# API0801 Markdown 一覧取得

## 1. 概要

指定フォルダ以下の `.md` をすべて、front matter 付きで返す。

## 2. エンドポイント

| 項目 | 値 |
|---|---|
| メソッド | GET |
| パス | `/api/docs` |
| 認証 | 不要（ユーザー `local` として処理する。FN0101-BR01） |
| 権限 | 利用者 |
| 実装 | `back/src/api/docs/handler.rs` |

## 3. リクエスト

| 名前 | 場所 | 型 | 必須 | 説明・制約 |
|---|---|---|---|---|
| root | query | string | ✕ | 表示するフォルダ。省略または空なら、設定の初期フォルダ（FN0701）、それも無ければリポジトリの `docs/`（FN0801-BR01） |

## 4. レスポンス

### 4.1 成功時

| ステータス | 内容 |
|---|---|
| 200 | 取得成功 |

| 名前 | 型 | 説明 |
|---|---|---|
| root | string | 表示しているフォルダの絶対パス |
| notice | string | 設定の初期フォルダが見つからず `docs/` を表示したときの説明（FN0801-BR14）。無ければ空文字 |
| docs[] | array | `.md` ファイル（パス順） |
| docs[].path | string | `root` からの相対パス |
| docs[].name | string | ファイル名 |
| docs[].hasFrontMatter | boolean | 先頭に front matter があるか |
| docs[].frontMatter | object | front matter の `key: value`（値は文字列。` #` 以降は除く） |

例:

```json
{
  "root": "/home/user/ari-docs/docs",
  "notice": "",
  "docs": [
    {
      "path": "00_概要/0090_ドキュメントルール.md",
      "name": "0090_ドキュメントルール.md",
      "hasFrontMatter": true,
      "frontMatter": {
        "id": "0090_ドキュメントルール",
        "status": "確定"
      }
    }
  ]
}
```

### 4.2 エラー時

| ステータス | 条件 |
|---|---|
| 400 | `root` がフォルダでない |
| 401 | ユーザー `local` が DB に無い（FN0101-BR02） |
| 404 | `root` が存在しない。Docs を使わない設定（FN0902-BR06、FN0801-BR15） |
| 500 | DB・ファイル操作の失敗 |

## 5. 処理

1. 表示するフォルダを決める。`root` の指定 → 設定の初期フォルダ（TBL0701）→ `docs/` の順（FN0801-BR01）。設定の初期フォルダが存在しなければ `docs/` にして `notice` を付ける（FN0801-BR14）。
2. `root` 以下の `.md` を再帰的に集め、パス順に並べる。
3. 各ファイルの front matter を読み、一覧を返す。

## 6. 関連

| 種類 | ID | 名称 |
|---|---|---|
| 機能要件 | FN0801 | Markdown ビューア |
| テーブル | TBL0701 | ユーザー設定 |

## 7. 未決事項

-
