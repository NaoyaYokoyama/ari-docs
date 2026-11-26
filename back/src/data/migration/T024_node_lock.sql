-- ============================================
-- Migration : T024
-- Description : ファイルのロック（FN0301-BR38）。ロックした人のほかは、上書き・名前の変更・移動・削除ができない。
--               期限（expires_at。UNIX 秒）を過ぎたら自動で外れる（読むときに期限を見る）。
--               ノードは node_id で指す（名前の変更・移動でも外れない）。ゴミ箱へ移すと node の行が消えて外れる
-- ============================================

DROP TABLE IF EXISTS node_lock;

CREATE TABLE IF NOT EXISTS node_lock (
    node_id TEXT PRIMARY KEY,

    user_id TEXT NOT NULL,

    -- ロックした日時と期限（UNIX 秒）
    locked_at INTEGER NOT NULL,

    expires_at INTEGER NOT NULL
);
