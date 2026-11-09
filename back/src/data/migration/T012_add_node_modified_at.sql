-- ============================================
-- Table : node
-- Description : ファイルの更新日時を持つ（ホームの「最近更新されたもの」。FN0201）
-- ============================================

-- ファイル・フォルダの更新日時（UNIX 時間の秒）。ノード同期（BAT0301）が更新する。0 は未取得
ALTER TABLE node ADD COLUMN modified_at INTEGER NOT NULL DEFAULT 0;
