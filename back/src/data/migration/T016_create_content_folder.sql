-- ============================================
-- Table : content_folder
-- Description : Note・Wiki を分けるフォルダ（FN0403）。入れ子にできる
-- ============================================

DROP TABLE IF EXISTS content_folder;
CREATE TABLE IF NOT EXISTS content_folder (
    folder_id TEXT PRIMARY KEY,

    -- 'note' / 'wiki'
    kind TEXT NOT NULL,

    -- Note のフォルダは持ち主（本人だけが使う）。Wiki のフォルダは作成者を表すだけ（全員で使う）
    user_id TEXT NOT NULL,

    -- 親のフォルダ。'' は一番上
    parent_id TEXT NOT NULL DEFAULT '',

    name TEXT NOT NULL,

    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- Table : content_folder_item
-- Description : Note・Wiki がどのフォルダに入っているか。行が無ければ一番上
-- ============================================

DROP TABLE IF EXISTS content_folder_item;
CREATE TABLE IF NOT EXISTS content_folder_item (
    kind TEXT NOT NULL,

    -- note_id / wiki_id
    item_id TEXT NOT NULL,

    folder_id TEXT NOT NULL,

    PRIMARY KEY (kind, item_id)
);
