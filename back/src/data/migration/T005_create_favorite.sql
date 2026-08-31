-- ============================================
-- Table : favorite
-- Description : ユーザーごとのお気に入りを管理する
-- ============================================

DROP TABLE favorite;
CREATE TABLE IF NOT EXISTS favorite (
    user_id TEXT NOT NULL,

    node_path INTEGER NULL,

    note_id INTEGER NULL,

    wiki_id TEXT INTEGER NULL

);
