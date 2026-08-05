-- ============================================
-- Table : user
-- Description : ログインユーザーを管理する
-- ============================================

CREATE TABLE IF NOT EXISTS user (
    user_id INTEGER PRIMARY KEY AUTOINCREMENT,

    login_id TEXT NOT NULL UNIQUE,

    display_name TEXT NOT NULL,

    role_id INTEGER NOT NULL,

    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (role_id) REFERENCES role(id)
);
