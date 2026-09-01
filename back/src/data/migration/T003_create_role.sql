-- ============================================
-- Table : role
-- Description : ロールおよび機能ごとの権限を管理する
-- ============================================

DROP TABLE role;
CREATE TABLE IF NOT EXISTS role (
    user_id TEXT PRIMARY KEY,

    role TEXT NOT NULL UNIQUE,

    folder_permission INTEGER NOT NULL DEFAULT 2,

    wiki_permission INTEGER NOT NULL DEFAULT 0,

    manager_permission INTEGER NOT NULL DEFAULT 0
);
