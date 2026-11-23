-- ============================================
-- Migration : T022
-- Description : ファイル・フォルダの説明（FN0301-BR33）と、使っていない表・列の削除。
--               - role 表（TBL0102）は消す。権限は user.role_id（admin / user）だけで決める（FN0102）
--               - node.status は消す。状態は持たず、説明（node.description）だけを使う
--               - trash_description: ゴミ箱へ移したもの（とその中のもの）の説明を控え、元に戻したら入れ直す
-- ============================================

DROP TABLE IF EXISTS role;

ALTER TABLE node DROP COLUMN status;

DROP TABLE IF EXISTS trash_description;

CREATE TABLE IF NOT EXISTS trash_description (
    trash_id TEXT NOT NULL,

    -- ゴミ箱へ移したものからの相対パス（そのものなら空。フォルダの中のものは "a/b.txt"）
    path TEXT NOT NULL DEFAULT '',

    description TEXT NOT NULL,

    PRIMARY KEY (trash_id, path)
);
