-- ============================================
-- Table : node
-- Description : フォルダ・ファイルの管理情報
-- ============================================

CREATE TABLE IF NOT EXISTS node (
    path TEXT NOT NULL PRIMARY KEY,

    description TEXT NOT NULL DEFAULT '',

    status INTEGER NOT NULL DEFAULT 0,

    updated_by TEXT NOT NULL DEFAULT '',

    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
