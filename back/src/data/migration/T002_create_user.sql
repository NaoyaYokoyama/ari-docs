-- ============================================
-- Table : user
-- Description : ログインユーザーを管理する
-- ============================================

DROP TABLE user;
CREATE TABLE IF NOT EXISTS user (
    user_id TEXT PRIMARY KEY,

    passwd TEXT NOT NULL,

    display_name TEXT NOT NULL,

    role_id TEXT NOT NULL,

    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP

);
