-- ============================================
-- Index : idx_node_path
-- Description : node.path を一意にする（TBL0301）。ファイルの見張りと全体の同期が同時に同じパスを登録すると、
--               同じパスの行が 2 つできることがあったため。
--               重なっている行は、先に登録した行（rowid の小さいもの）を残し、お気に入りを残す行に付け替える。
--               消す行の中身の検索の単語・状態は消す（次の取り込みで、残した行で取り込み直す）
-- ============================================

UPDATE favorite
SET node_id = (
    SELECT kept.node_id
    FROM node AS dup
    JOIN node AS kept ON kept.path = dup.path
    WHERE dup.node_id = favorite.node_id
    ORDER BY kept.rowid
    LIMIT 1
)
WHERE node_id IN (
    SELECT node_id FROM node AS n
    WHERE EXISTS (SELECT 1 FROM node AS o WHERE o.path = n.path AND o.rowid < n.rowid)
);

DELETE FROM node_keyword
WHERE node_id IN (
    SELECT node_id FROM node AS n
    WHERE EXISTS (SELECT 1 FROM node AS o WHERE o.path = n.path AND o.rowid < n.rowid)
);

DELETE FROM node_content
WHERE node_id IN (
    SELECT node_id FROM node AS n
    WHERE EXISTS (SELECT 1 FROM node AS o WHERE o.path = n.path AND o.rowid < n.rowid)
);

DELETE FROM node
WHERE EXISTS (SELECT 1 FROM node AS o WHERE o.path = node.path AND o.rowid < node.rowid);

DROP INDEX IF EXISTS idx_node_path;
CREATE UNIQUE INDEX idx_node_path ON node (path);
