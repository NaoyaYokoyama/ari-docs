-- ============================================
-- Table : search_exclusion
-- Description : 検索の対象外（FN0202-BR16）。誰かが作ったバックアップ・古い版のフォルダなどを検索に出さない。
--               全員の対象外（user_id が空）は中身の取り込みもしない。個人の対象外は本人の検索の結果からだけ外す
-- ============================================

DROP TABLE IF EXISTS search_exclusion;

CREATE TABLE IF NOT EXISTS search_exclusion (
    exclusion_id TEXT PRIMARY KEY,

    -- 対象外にする人。空なら全員（ローカルモードは常に空）
    user_id TEXT NOT NULL DEFAULT '',

    -- 'path'（folder/ からのパス。そのフォルダ・ファイルと中のもの） / 'name'（名前の型。* と ? を使える。どこにあっても）
    kind TEXT NOT NULL,

    value TEXT NOT NULL,

    -- 登録したユーザー ID
    created_by TEXT NOT NULL,

    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

    UNIQUE (user_id, kind, value)
);
