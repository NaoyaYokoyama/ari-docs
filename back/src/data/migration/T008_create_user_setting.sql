-- ============================================
-- Table : user_setting
-- Description : ユーザーごとの設定
-- ============================================

CREATE TABLE IF NOT EXISTS user_setting (
    -- ユーザーID
    user_id TEXT PRIMARY KEY,

    -- Docs（Markdown ビューア）の初期フォルダの絶対パス。空文字ならリポジトリの docs/
    docs_root TEXT NOT NULL DEFAULT '',

    -- 更新日時
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
