-- ============================================================
--  Rippling — 002_indexes.sql
--  索引定义（基于 001_initial_schema.sql 中的表）
--
--  原则：
--    - 覆盖高频查询路径
--    - UNIQUE 约束已在建表时声明的不再重复创建
--    - 复合索引按查询过滤顺序排列
-- ============================================================

-- ============================================================
--  帖子相关索引
-- ============================================================

-- 按作者查询帖子
CREATE INDEX idx_post_authorId ON post(authorId);

-- 按父帖查询回复
CREATE INDEX idx_post_parentId ON post(parentId);

-- 按板块查询帖子
CREATE INDEX idx_post_blockId ON post(blockId);

-- 按时间排序帖子
CREATE INDEX idx_post_createdAt ON post(createdAt);

-- 置顶帖排序（置顶优先，再按时间）
CREATE INDEX idx_post_pinned_created ON post(isPinned, createdAt);

-- 帖子可见性白名单查询
CREATE INDEX idx_post_visibility_post_user ON post_visibility(postId, userId);

-- ============================================================
--  点赞相关索引
-- ============================================================

-- 按用户查询点赞记录（其余查询由 UNIQUE(targetType, targetId, userId) 覆盖）
CREATE INDEX idx_likes_userId ON likes(userId);

-- ============================================================
--  表白墙索引
-- ============================================================

-- 按作者查询表白墙内容
CREATE INDEX idx_confession_authorId ON confession(authorId);

-- ============================================================
--  大事记索引
-- ============================================================

-- 按状态+日期查询待审核/已发布事件
CREATE INDEX idx_timeline_status_date ON timeline_event(status, eventDate);

-- ============================================================
--  投票相关索引
-- ============================================================

-- 按创建时间排序投票列表
CREATE INDEX idx_vote_createdAt ON vote(createdAt);

-- ============================================================
--  关注相关索引
-- ============================================================

-- 查询某用户的关注列表
CREATE INDEX idx_follow_follower ON follow(followerId);

-- 查询某用户的粉丝列表
CREATE INDEX idx_follow_following ON follow(followingId);

-- ============================================================
--  提问箱索引
-- ============================================================

-- 按提问箱查询问题列表
CREATE INDEX idx_question_boxId ON question(boxId);

-- ============================================================
--  工单相关索引
-- ============================================================

-- 按状态+时间查询工单列表
CREATE INDEX idx_ticket_status_created ON ticket(status, createdAt);

-- 按提交者查询工单
CREATE INDEX idx_ticket_submittedBy ON ticket(submittedBy);

-- ============================================================
--  板块相关索引
-- ============================================================

-- 板块加入申请查询
CREATE INDEX idx_block_join_request_block_status ON block_join_request(blockId, status);

-- ============================================================
--  系统表索引
-- ============================================================

-- 归档操作按目标+时间查询
CREATE INDEX idx_archive_target_created ON archive_operation(targetType, targetId, createdAt);

-- 管理日志按时间排序
CREATE INDEX idx_admin_log_createdAt ON admin_log(createdAt);

-- ============================================================
--  通知表索引
-- ============================================================

-- 通知按用户+时间查询
CREATE INDEX idx_notification_user_created ON notification(userId, createdAt);

