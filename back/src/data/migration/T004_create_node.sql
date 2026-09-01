-- ============================================
-- Table : node
-- Description : フォルダ・ファイルの管理情報
-- ============================================

DROP TABLE node;
CREATE TABLE IF NOT EXISTS node (
    node_id TEXT PRIMARY KEY,

    path TEXT NOT NULL,

    description TEXT NOT NULL DEFAULT '',

    status INTEGER NOT NULL DEFAULT 0,

    updated_by TEXT NOT NULL DEFAULT '',

    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
