-- ============================================
-- Table : trash / backup / system_setting
-- Description : ゴミ箱（FN0302）、バックアップ（FN0901）、管理者が決める設定
-- ============================================

DROP TABLE IF EXISTS trash;
DROP TABLE IF EXISTS backup;
DROP TABLE IF EXISTS system_setting;

-- ゴミ箱に入れたファイル・フォルダ。実体は <データのフォルダ>/trash/<trash_id>/<name>
CREATE TABLE IF NOT EXISTS trash (
    trash_id TEXT PRIMARY KEY,

    -- 元の場所（folder/ からの相対パス）
    original_path TEXT NOT NULL,

    name TEXT NOT NULL,

    -- folder / file
    node_type TEXT NOT NULL,

    -- サイズ（バイト。フォルダは中身の合計）
    size INTEGER NOT NULL DEFAULT 0,

    -- 削除したユーザー
    deleted_by TEXT NOT NULL,

    deleted_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- バックアップ。実体は <バックアップの保存先>/<file_name>（zip。DB と folder/ を含む）
CREATE TABLE IF NOT EXISTS backup (
    backup_id TEXT PRIMARY KEY,

    file_name TEXT NOT NULL,

    -- 保存先のフォルダ（作ったときの絶対パス。保存先を変えても前のものを扱えるように）
    dir TEXT NOT NULL,

    size INTEGER NOT NULL DEFAULT 0,

    -- auto（定期）/ manual（手動）/ before_restore（復元の前の自動）
    kind TEXT NOT NULL,

    -- 定期のときの期間（daily は YYYY-MM-DD、weekly は YYYY-Www、monthly は YYYY-MM）。同じ期間に 2 回取らないため
    period TEXT NOT NULL DEFAULT '',

    created_by TEXT NOT NULL,

    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 管理者が決める設定（バックアップの間隔・保存期間・ゴミ箱の保存期間など）。無い項目は既定値を使う
CREATE TABLE IF NOT EXISTS system_setting (
    key TEXT PRIMARY KEY,

    value TEXT NOT NULL,

    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
