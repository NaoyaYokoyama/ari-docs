---
id: TL0001
title: 開発環境構築（Linux）
type: ツール
status: レビュー中
related: [OP0001, OP0004, OP0005, TL0003]
updated: 2026-10-11
---

# TL0001 開発環境構築（Linux）

## 1. 概要

| 項目 | 値 |
|---|---|
| 目的 | Linux に ari-docs の開発環境を作る |
| 対象 OS | Linux |
| 検証した環境 | Fedora 44、Rust 1.96.1、Node.js 22.23、Docker |

## 2. 必要なもの

| ツール | バージョン | 用途 |
|---|---|---|
| git | - | ソースの取得 |
| Docker（Docker Compose を含む） | - | フロントエンドの開発サーバー |
| Rust（rustup・cargo） | 1.85 以上（edition 2024） | バックエンド、デスクトップアプリ |
| Node.js・npm | 22 系 | フロントエンドのビルド・型チェック・lint（ホストでも実行する） |
| sqlite3 | - | DB の確認（OP0004） |
| tauri-cli | 2 系 | デスクトップアプリの起動・ビルド（OP0001 の 2.3、OP0002） |
| Tauri の前提パッケージ | - | デスクトップアプリのビルド（WebKitGTK など。Tauri の公式手順を参照） |

## 3. 手順

1. ソースを取得する。

```bash
git clone <リポジトリの URL>
cd ari-docs
```

2. ノードの置き場所を作る（OP0005）。

```bash
mkdir -p folder
```

3. フロントエンドの依存をホストにも入れる（ビルド・型チェック・lint・作業終了時の自動チェックで使う）。

```bash
cd front
npm install
cd ..
```

4. フロントエンドの開発サーバー（Docker）を作って起動する。

```bash
docker compose build
docker compose up -d
```

5. バックエンドを起動する（DB・テーブル・ユーザー `local` が自動で作られる）。

```bash
cd back
cargo run
```

6. デスクトップアプリを使う場合は tauri-cli を入れる。

```bash
cargo install tauri-cli --version "^2.0"
```

## 4. 確認方法

- ブラウザで `http://localhost:5173` を開くとホームが表示される
- 作業終了時の自動チェックと同じ内容が通る（TL0003）

```bash
.claude/hooks/verify.sh < /dev/null
```

## 5. 未決事項

- Node.js をホストと Docker の両方に入れている（ホスト側は検証・ビルド用）。どちらかに寄せるか
