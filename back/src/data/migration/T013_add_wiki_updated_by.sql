-- ============================================
-- Table : wiki
-- Description : 最後に更新したユーザーを記録する（FN0501-BR09。旧 RQ0502）
-- ============================================

-- 最後に更新したユーザー ID。作成しただけなら空文字（画面では作成者を出す）
ALTER TABLE wiki ADD COLUMN updated_by TEXT NOT NULL DEFAULT '';
