-- 003: question_box.ownerId 索引
--
-- getUserPublicProfile 通过 LEFT JOIN question_box(ownerId) 读取提问箱开关状态，
-- 为查询键添加索引（提问箱按 owner 查询也复用该索引）。

CREATE INDEX IF NOT EXISTS idx_question_box_ownerId ON question_box(ownerId);
