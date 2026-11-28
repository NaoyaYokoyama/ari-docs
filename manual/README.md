# 使い方の説明書（manual/）

ari-docs を導入する会社・使う人に渡す説明書。元は Markdown で書き、PDF にして配る。

| ファイル | 読む人 | 内容 |
|---|---|---|
| `01_利用の手引き.md` | 使うすべての人 | 画面の見方・探す・Folder・Note と Wiki・タスク・設定・困ったとき |
| `02_導入と運用の手引き.md` | 導入の担当・管理者 | 入れ方（個人用・Linux の共有サーバー・この PC の公開）・ユーザーと権限・設定・バックアップ・更新・セキュリティ |
| `images/` | - | 画面の写し（見本のデータで撮ったもの。個人の情報を写さない） |
| `assets/` | - | 表紙の型（`template.html`）・見た目（`style.css`）・アイコン |
| `pdf/` | - | 出来上がりの PDF（`build.mjs` で作る） |

## PDF にする

```bash
node manual/build.mjs        # すべて
node manual/build.mjs 01     # 番号が 01 のものだけ
```

- 要るもの: pandoc と、Chrome か Edge（場所は環境変数 `CHROME` でも指定できる）。npm の部品は使わない
- 表紙の「対象の版」は `back/Cargo.toml` の版、「発行日」は作った日
- 書き方: 先頭の `---` の中に `title`・`subtitle`・`audience`。`#` が章（新しいページから）。画面の写しは `::: shot` の中に画像と `[説明]{.caption}`。枠は `::: note`（メモ）・`::: point`（ポイント）・`::: warning`（ご注意）。キーは `<kbd>Ctrl</kbd>`
- 機能を変えたら、説明書も直して PDF を作り直す（画面が大きく変わったら写しも撮り直す）
