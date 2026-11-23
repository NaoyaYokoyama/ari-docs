-- ============================================
-- Migration : T023
-- Description : 利用者に付ける許可（FN0102-BR11）と管理者の PC（FN0102-BR12）。管理者が、管理者でない利用者に
--               検索の辞書・全員の検索の対象外・バックアップの操作を 1 つずつ許す。
--               行が無ければ許可なし（今までと同じ）。管理者とローカルモードは表によらずすべてできる
-- ============================================

DROP TABLE IF EXISTS user_permission;

CREATE TABLE IF NOT EXISTS user_permission (
    user_id TEXT NOT NULL,

    -- dictionary（検索の辞書）・exclusion（全員の検索の対象外）・backup（バックアップを取る・設定。復元は除く）
    permission TEXT NOT NULL,

    PRIMARY KEY (user_id, permission)
);

-- 管理者の PC（FN0102-BR12）。管理者の操作は、ここに登録した PC のデスクトップアプリからだけできる。
-- アプリが場所ごとに作った鍵を X-Ari-Device で送り、ここには鍵の SHA-256 だけを残す
DROP TABLE IF EXISTS admin_device;

CREATE TABLE IF NOT EXISTS admin_device (
    device_id TEXT PRIMARY KEY,

    user_id TEXT NOT NULL,

    -- 鍵の SHA-256（16 進数）
    key_hash TEXT NOT NULL,

    -- 端末の名前（例: Windows・デスクトップアプリ）
    name TEXT NOT NULL DEFAULT '',

    -- 日時はほかの表と同じく UTC
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

    last_used_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

    UNIQUE (user_id, key_hash)
);
