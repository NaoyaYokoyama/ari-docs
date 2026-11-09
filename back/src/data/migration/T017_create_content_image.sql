-- ============================================
-- Table : content_image
-- Description : Note・Wiki の本文に貼り付けた画像（FN0404）。画面で縮小してから受け取る。
--               本文・変更履歴のどこからも使われなくなったものは、1 日たってから消す（BAT0901）
-- ============================================

DROP TABLE IF EXISTS content_image;

CREATE TABLE IF NOT EXISTS content_image (
    image_id TEXT PRIMARY KEY,

    -- 貼り付けた先の種類（'note' / 'wiki'）。Note の画像は貼り付けた本人（と、その画像を使っている Wiki を読める人）だけが見られる
    kind TEXT NOT NULL,

    -- 貼り付けたユーザー ID
    user_id TEXT NOT NULL,

    -- image/webp・image/jpeg・image/png・image/gif
    mime TEXT NOT NULL,

    data BLOB NOT NULL,

    -- バイト数
    size INTEGER NOT NULL,

    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
