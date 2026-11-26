-- ============================================
-- Migration : T025
-- Description : ファイルの以前の版（FN0301-BR39）。ari-docs で上書きする前の中身を、データのフォルダの
--               versions/<version_id> に残す。ファイルは node_id で指す（名前の変更・移動でも残る）。
--               ゴミ箱にある間は node_id を 'trash:<trash_id>:<中の相対パス>' にし、元に戻したら付け直す
-- ============================================

DROP TABLE IF EXISTS node_version;

CREATE TABLE IF NOT EXISTS node_version (
    version_id TEXT PRIMARY KEY,

    node_id TEXT NOT NULL,

    -- 残したときのファイルの名前・大きさと、その中身の更新日時（UNIX 秒）
    name TEXT NOT NULL,

    size INTEGER NOT NULL,

    modified_at INTEGER NOT NULL,

    -- 上書きした人と日時（UNIX 秒）
    replaced_by TEXT NOT NULL DEFAULT '',

    replaced_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_node_version_node ON node_version (node_id, replaced_at);
