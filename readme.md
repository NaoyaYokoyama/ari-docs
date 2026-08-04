# README


## プロジェクト作成時(備忘録）

- git
    - githubでプロジェクト作成
    - git clone

- npm create vite@latest .
    - React
    - TypeScript + React Compiler
    - Oxlint
    - with npm Yes
- npm ライブラリの追加
    - docker compose exec frontend npm install -D @types/node
    - docker compose exec npm install tailwindcss @tailwindcss/vite
    - docker compose exec frontend npm shadcn@latest init
    - docker compose exec frontend npm install @tanstack/react-table
    - docker compose exec frontend npm install react-router-dom

## 開発参加者へ

### 0. 概要

- バックエンド: Rust
- フロントエンド: React
- CSS: Tailwind CSS

### 1. リポジトリを取得

- git clone <repository>
- cd ari-docs

### 2. Dockerコマンド

- docker compose build --no-cache
- docker compose up
- docker compose up -d
- docker compose down

## ディレクトリ構成

ari-docs/
├── front/
├── back/
├── folder/
├── docker-compose.yml
└── README.md

## License

This project is licensed under the MIT License.
See the LICENSE file for details.
