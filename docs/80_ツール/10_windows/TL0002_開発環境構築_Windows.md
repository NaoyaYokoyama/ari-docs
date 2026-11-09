---
id: TL0002
title: 開発環境構築（Windows）
type: ツール
status: 草案
related: [TL0001]
updated: 2026-10-11
---

# TL0002 開発環境構築（Windows）

<!-- 記入ガイド: Windows での手順は未検証。検証したら status を「レビュー中」にする -->

## 1. 概要

| 項目 | 値 |
|---|---|
| 目的 | Windows に ari-docs の開発環境を作る |
| 対象 OS | Windows |
| 検証した環境 | 未検証 |

## 2. 必要なもの

TL0001 の 2 章と同じツールを、Windows 版で用意する。次の点が Linux と異なる。

| ツール | 補足 |
|---|---|
| Docker Desktop | Docker・Docker Compose の代わり |
| Microsoft C++ Build Tools | Rust（MSVC ツールチェーン）のビルドに必要 |
| WebView2 | デスクトップアプリ（Tauri）の表示に必要（Windows 11 は標準で入っている） |
| sqlite3 | `sqlite3.exe` を入手して PATH に置く |

## 3. 手順

TL0001 の 3 章と同じ。次の点を読み替える。

- コマンドは PowerShell で実行する
- `mkdir -p folder` は `New-Item -ItemType Directory -Force folder`
- 作業終了時の自動チェック（`.claude/hooks/verify.sh`）は bash で書いているので、Git Bash などの bash が必要

## 4. 確認方法

TL0001 の 4 章と同じ。

## 5. 未決事項

- Windows での手順の検証
- WSL2 上で Linux と同じ手順（TL0001）で構築する方法を標準にするか
