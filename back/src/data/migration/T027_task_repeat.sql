-- ============================================
-- Migration : T027
-- Description : タスクの繰り返し（FN0602-BR10）。完了にしたら次の回のタスクを作る
--               ''（なし）/ daily（毎日）/ weekdays（平日）/ weekly（毎週）/ monthly（毎月）
-- ============================================

ALTER TABLE task ADD COLUMN repeat TEXT NOT NULL DEFAULT '';
