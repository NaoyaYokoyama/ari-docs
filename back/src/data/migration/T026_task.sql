-- ============================================
-- Migration : T026
-- Description : 個人のタスク（FN0602）。作った本人だけが見る・変える（Note と同じ）。
--               状態ごと（未着手・進行中・完了）に並び順（sort_order。小さいほど上）を持つ
-- ============================================

DROP TABLE IF EXISTS task;

CREATE TABLE IF NOT EXISTS task (
    task_id TEXT PRIMARY KEY,

    user_id TEXT NOT NULL,

    title TEXT NOT NULL,

    -- メモ（無ければ空）
    description TEXT NOT NULL DEFAULT '',

    -- high / medium / low
    priority TEXT NOT NULL DEFAULT 'medium',

    -- 期限（YYYY-MM-DD。無ければ空）
    due_date TEXT NOT NULL DEFAULT '',

    -- todo（未着手）/ doing（進行中）/ done（完了）
    status TEXT NOT NULL DEFAULT 'todo',

    sort_order INTEGER NOT NULL DEFAULT 0,

    -- 日時はほかの表と同じく UTC
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

    -- 完了にした日時（完了でなければ空）
    completed_at TEXT NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_task_user ON task (user_id, status, sort_order);
