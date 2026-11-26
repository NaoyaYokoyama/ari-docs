-- ============================================
-- Migration : T028
-- Description : 個人の WBS（FN0602-BR14）。タスクの親（空なら一番上）・開始日・同じ親の中の並び
-- ============================================

ALTER TABLE task ADD COLUMN parent_id TEXT NOT NULL DEFAULT '';

-- 開始日（YYYY-MM-DD。無ければ空）
ALTER TABLE task ADD COLUMN start_date TEXT NOT NULL DEFAULT '';

-- 同じ親の中の並び（小さいほど上）。カンバンの列の並び（sort_order）とは別
ALTER TABLE task ADD COLUMN wbs_order INTEGER NOT NULL DEFAULT 0;
