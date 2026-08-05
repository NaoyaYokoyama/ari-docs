-- ============================================
-- Table : favorite
-- Description : ユーザーごとのお気に入りを管理する
-- ============================================

CREATE TABLE IF NOT EXISTS favorite (
    user_id INTEGER NOT NULL,

    node_path TEXT NOT NULL,

    PRIMARY KEY (user_id, node_path),

    FOREIGN KEY (user_id) REFERENCES user(id),

    FOREIGN KEY (node_path) REFERENCES node(path)
);
