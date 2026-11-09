-- ============================================
-- Table : content_history
-- Description : Note・Wiki の変更履歴（FN0402）。保存するたびにその版を残す
-- ============================================

DROP TABLE IF EXISTS content_history;

CREATE TABLE IF NOT EXISTS content_history (
    history_id INTEGER PRIMARY KEY,

    -- note / wiki
    kind TEXT NOT NULL,

    -- note_id / wiki_id
    content_id TEXT NOT NULL,

    title TEXT NOT NULL,

    content TEXT NOT NULL,

    -- その版を保存したユーザー ID
    updated_by TEXT NOT NULL,

    -- その版の更新日時（UTC。note・wiki の updated_at と同じ形）
    saved_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_content_history_content ON content_history (kind, content_id, history_id);
