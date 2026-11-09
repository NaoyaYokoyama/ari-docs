-- ============================================
-- Table : keyword / node_keyword / node_content / search_dictionary
-- Description : ファイルの中身の検索（FN0202）。ファイルから取り出した単語の索引と、利用者が登録する単語（ユーザー辞書）
-- ============================================

DROP TABLE IF EXISTS node_keyword;
DROP TABLE IF EXISTS keyword;
DROP TABLE IF EXISTS node_content;
DROP TABLE IF EXISTS search_dictionary;

-- 単語。同じ単語は 1 行にまとめ、ファイルとの対応（node_keyword）は ID で持つ（容量を抑えるため）
CREATE TABLE IF NOT EXISTS keyword (
    keyword_id INTEGER PRIMARY KEY,

    -- 表記（NFKC で正規化し、英字は小文字）
    word TEXT NOT NULL UNIQUE
);

-- どのファイル（ノード）にどの単語があるか。検索は単語から引くため keyword_id を先頭にする
CREATE TABLE IF NOT EXISTS node_keyword (
    keyword_id INTEGER NOT NULL,

    node_id TEXT NOT NULL,

    PRIMARY KEY (keyword_id, node_id)
) WITHOUT ROWID;

-- ファイルを取り込み直すときに、そのファイルの行を消すため
CREATE INDEX IF NOT EXISTS idx_node_keyword_node_id ON node_keyword (node_id);

-- ファイルごとの取り込みの状態。更新日時・サイズ・辞書の版が変わったら取り込み直す
CREATE TABLE IF NOT EXISTS node_content (
    node_id TEXT PRIMARY KEY,

    -- 取り込んだときのファイルの更新日時（UNIX 時間の秒）とサイズ（バイト）
    modified_at INTEGER NOT NULL,

    size INTEGER NOT NULL,

    -- indexed（取り込み済み）/ too_large（大きすぎて対象外）/ error（読めなかった）
    status TEXT NOT NULL,

    -- error のときの原因
    message TEXT NOT NULL DEFAULT '',

    -- 取り込んだときのユーザー辞書の版（search_dictionary から計算する）
    dictionary_version INTEGER NOT NULL,

    -- 登録した単語の数
    word_count INTEGER NOT NULL DEFAULT 0,

    indexed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 利用者が登録する単語（業界用語・社内の用語など）。単語の区切りのユーザー辞書として使う
CREATE TABLE IF NOT EXISTS search_dictionary (
    -- 表記（NFKC で正規化し、英字は小文字）
    word TEXT PRIMARY KEY,

    -- 登録したユーザー
    created_by TEXT NOT NULL,

    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
