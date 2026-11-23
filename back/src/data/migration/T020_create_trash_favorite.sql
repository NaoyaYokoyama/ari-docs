-- ============================================
-- Table : trash_favorite
-- Description : ゴミ箱へ移したファイル・フォルダ（とその中のもの）を、お気に入りにしていた人（FN0302-BR08）。
--               元に戻したら、戻した場所でお気に入りに入れ直す。完全に削除したら消す
-- ============================================

DROP TABLE IF EXISTS trash_favorite;

CREATE TABLE IF NOT EXISTS trash_favorite (
    trash_id TEXT NOT NULL,

    -- お気に入りにしていたユーザー
    user_id TEXT NOT NULL,

    -- ゴミ箱へ移したものからの相対パス（そのものなら空。フォルダの中のものは "a/b.txt"）
    path TEXT NOT NULL DEFAULT '',

    PRIMARY KEY (trash_id, user_id, path)
);
