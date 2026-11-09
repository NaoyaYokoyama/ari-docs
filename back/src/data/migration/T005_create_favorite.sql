-- ============================================
-- Table : favorite
-- Description : ユーザーごとのお気に入りを管理する
-- ============================================

DROP TABLE IF EXISTS favorite;
CREATE TABLE IF NOT EXISTS favorite (
    favorite_id TEXT PRIMARY KEY,

    user_id TEXT NOT NULL,

    node_id TEXT NOT NULL,

    note_id TEXT NOT NULL,

    wiki_id TEXT NOT NULL
);
