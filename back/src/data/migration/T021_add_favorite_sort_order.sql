-- ============================================
-- Column : favorite.sort_order
-- Description : お気に入りの並び順（TBL0601。FN0601-BR08）。利用者がホームでドラッグして並べ替える。
--               小さいものほど上。新しく登録したものは一番上（今ある中の最小より 1 小さい値）にする。
--               今あるものは登録の新しい順（rowid の大きい順）に 0, 1, 2… を振る
-- ============================================

ALTER TABLE favorite ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0;

UPDATE favorite
SET sort_order = (
    SELECT COUNT(*) FROM favorite AS newer
    WHERE newer.user_id = favorite.user_id AND newer.rowid > favorite.rowid
);
