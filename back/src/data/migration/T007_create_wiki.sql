-- ============================================
-- Table : wiki
-- Description : wikiの管理情報
-- ============================================

CREATE TABLE IF NOT EXISTS wiki (
    wiki_id     INTEGER PRIMARY KEY AUTOINCREMENT,

    user_id     TEXT NOT NULL,

    title       TEXT NOT NULL,

    content     TEXT NOT NULL DEFAULT '',

    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

