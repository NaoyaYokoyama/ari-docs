-- ============================================
-- Table : session / login_failure
-- Description : ログインのセッション（再起動しても続くように DB に保存する）と、ログインの失敗の記録（FN0101）
-- ============================================

DROP TABLE IF EXISTS session;
DROP TABLE IF EXISTS login_failure;

CREATE TABLE IF NOT EXISTS session (
    -- トークン（UUID v4）
    session_id TEXT PRIMARY KEY,

    user_id TEXT NOT NULL,

    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

    -- 最後に使った日時。ここから有効期限（FN0101-BR09）までは使える
    last_used_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_session_user_id ON session (user_id);

-- ユーザー ID ごとの、続けてログインに失敗した回数とロックの終わり（FN0101-BR12）。
-- 無いユーザー ID も記録する（あるかどうかを見分けられないようにするため）
CREATE TABLE IF NOT EXISTS login_failure (
    user_id TEXT PRIMARY KEY,

    failures INTEGER NOT NULL DEFAULT 0,

    -- この日時（UTC）まではログインできない。ロックしていなければ空文字
    locked_until TEXT NOT NULL DEFAULT '',

    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
