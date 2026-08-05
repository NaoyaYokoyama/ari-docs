-- ============================================
-- Table : schema_migration
-- Description : 実行済みMigrationを管理する
-- ============================================

CREATE TABLE IF NOT EXISTS schema_migration (
    -- Migrationファイル名（拡張子なし）
    migration_name TEXT NOT NULL PRIMARY KEY,

    -- 適用日時
    applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
