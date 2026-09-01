-- ============================================
-- Table : note
-- Description : 個人メモの管理情報
-- ============================================

DROP TABLE note;
CREATE TABLE IF NOT EXISTS note (
    note_id TEXT PRIMARY KEY,

    user_id TEXT NOT NULL,

    title TEXT NOT NULL,

    content TEXT NOT NULL DEFAULT '',

    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

