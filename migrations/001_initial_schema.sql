-- ============================================================
--  Rippling — 001_initial_schema.sql
--  初始数据库 Schema（Cloudflare D1 / SQLite）
--
--  约定：
--    - 主键：TEXT（UUID）
--    - 时间戳：TEXT（ISO 8601，如 2026-08-16T00:00:00.000Z）
--    - 布尔值：INTEGER（0/1）
--    - 外键：REFERENCES
--    - 索引：见 002_indexes.sql
-- ============================================================

-- ============================================================
--  一、认证表（Better Auth 标准四表）
-- ============================================================

-- 用户基础表（Better Auth 管理）
CREATE TABLE user (
    id            TEXT PRIMARY KEY,
    name          TEXT,
    email         TEXT UNIQUE,
    emailVerified INTEGER,
    image         TEXT,
    createdAt     TEXT,
    updatedAt     TEXT
);

-- 会话表
CREATE TABLE session (
    id        TEXT PRIMARY KEY,
    expiresAt TEXT,
    token     TEXT UNIQUE,
    userId    TEXT NOT NULL REFERENCES user(id),
    ipAddress TEXT,
    userAgent TEXT,
    createdAt TEXT,
    updatedAt TEXT
);

-- 第三方账户表
CREATE TABLE account (
    id           TEXT PRIMARY KEY,
    accountId    TEXT,
    providerId   TEXT,
    userId       TEXT NOT NULL REFERENCES user(id),
    password     TEXT,
    accessToken  TEXT,
    refreshToken TEXT,
    expiresAt    TEXT,
    createdAt    TEXT,
    updatedAt    TEXT
);

-- 验证令牌表
CREATE TABLE verification (
    id         TEXT PRIMARY KEY,
    identifier TEXT,
    value      TEXT,
    expiresAt  TEXT,
    createdAt  TEXT,
    updatedAt  TEXT
);

-- ============================================================
--  二、用户扩展表
-- ============================================================

-- 用户资料扩展表（学号、权限、徽章等）
CREATE TABLE user_profile (
    id                TEXT PRIMARY KEY,
    userId            TEXT NOT NULL UNIQUE REFERENCES user(id),
    studentId         TEXT UNIQUE,
    username          TEXT NOT NULL UNIQUE,
    permissions       INTEGER NOT NULL DEFAULT 0,
    nameColor         TEXT DEFAULT 'black',
    badge             TEXT,
    questionBoxEnabled INTEGER DEFAULT 0,
    violationCount    INTEGER DEFAULT 0,
    createdAt         TEXT NOT NULL,
    updatedAt         TEXT NOT NULL
);

-- 用户设备表（设备指纹、主设备管理）
CREATE TABLE user_device (
    id           TEXT PRIMARY KEY,
    userId       TEXT NOT NULL REFERENCES user(id),
    deviceId     TEXT NOT NULL,
    fingerprint  TEXT,
    isMainDevice INTEGER DEFAULT 0,
    isBlocked    INTEGER DEFAULT 0,
    lastLoginAt  TEXT,
    createdAt    TEXT NOT NULL,
    UNIQUE(userId, deviceId)
);

-- 用户操作日志表
CREATE TABLE user_log (
    id        TEXT PRIMARY KEY,
    userId    TEXT NOT NULL REFERENCES user(id),
    action    TEXT NOT NULL,
    detail    TEXT,
    createdAt TEXT NOT NULL
);

-- ============================================================
--  三、内容表
-- ============================================================

-- 帖子表（支持嵌套回复 parentId、板块归属 blockId）
CREATE TABLE post (
    id            TEXT PRIMARY KEY,
    parentId      TEXT REFERENCES post(id),
    authorId      TEXT NOT NULL REFERENCES user(id),
    authorVisible INTEGER NOT NULL DEFAULT 1,
    title         TEXT,
    content       TEXT NOT NULL,
    visibility    TEXT NOT NULL DEFAULT 'public',
    blockId       TEXT,
    isPinned      INTEGER DEFAULT 0,
    isArchived    INTEGER DEFAULT 0,
    isDeleted     INTEGER DEFAULT 0,
    createdAt     TEXT NOT NULL,
    updatedAt     TEXT NOT NULL
);

-- 帖子可见性白名单（指定可见用户）
CREATE TABLE post_visibility (
    id        TEXT PRIMARY KEY,
    postId    TEXT NOT NULL REFERENCES post(id),
    userId    TEXT NOT NULL REFERENCES user(id),
    createdAt TEXT NOT NULL,
    UNIQUE(postId, userId)
);

-- 点赞表（多态：targetType 区分帖子/评论/表白墙等）
CREATE TABLE likes (
    id         TEXT PRIMARY KEY,
    targetType TEXT NOT NULL,
    targetId   TEXT NOT NULL,
    userId     TEXT NOT NULL REFERENCES user(id),
    createdAt  TEXT NOT NULL,
    UNIQUE(targetType, targetId, userId)
);

-- 表白墙表
CREATE TABLE confession (
    id        TEXT PRIMARY KEY,
    authorId  TEXT NOT NULL REFERENCES user(id),
    content   TEXT NOT NULL,
    isDeleted INTEGER DEFAULT 0,
    createdAt TEXT NOT NULL,
    updatedAt TEXT NOT NULL
);

-- 大事记表
CREATE TABLE timeline_event (
    id          TEXT PRIMARY KEY,
    title       TEXT NOT NULL,
    description TEXT NOT NULL,
    eventDate   TEXT NOT NULL,
    status      TEXT NOT NULL DEFAULT 'pending',
    submittedBy TEXT NOT NULL REFERENCES user(id),
    reviewedBy  TEXT,
    createdAt   TEXT NOT NULL,
    reviewedAt  TEXT
);

-- ============================================================
--  四、投票表
-- ============================================================

-- 投票主表
CREATE TABLE vote (
    id              TEXT PRIMARY KEY,
    title           TEXT NOT NULL,
    description     TEXT,
    isMultiple      INTEGER DEFAULT 0,
    isRealTimeVisible INTEGER DEFAULT 1,
    endAt           TEXT NOT NULL,
    createdBy       TEXT NOT NULL REFERENCES user(id),
    isClosed        INTEGER DEFAULT 0,
    createdAt       TEXT NOT NULL
);

-- 投票选项表
CREATE TABLE vote_option (
    id        TEXT PRIMARY KEY,
    voteId    TEXT NOT NULL REFERENCES vote(id),
    content   TEXT NOT NULL,
    createdAt TEXT NOT NULL
);

-- 投票记录表
CREATE TABLE vote_record (
    id        TEXT PRIMARY KEY,
    voteId    TEXT NOT NULL REFERENCES vote(id),
    optionId  TEXT NOT NULL REFERENCES vote_option(id),
    userId    TEXT NOT NULL REFERENCES user(id),
    createdAt TEXT NOT NULL,
    UNIQUE(voteId, userId)
);

-- ============================================================
--  五、社交表
-- ============================================================

-- 关注表
CREATE TABLE follow (
    id          TEXT PRIMARY KEY,
    followerId  TEXT NOT NULL REFERENCES user(id),
    followingId TEXT NOT NULL REFERENCES user(id),
    createdAt   TEXT NOT NULL,
    UNIQUE(followerId, followingId)
);

-- 提问箱表
CREATE TABLE question_box (
    id            TEXT PRIMARY KEY,
    ownerId       TEXT NOT NULL UNIQUE REFERENCES user(id),
    enabled       INTEGER DEFAULT 0,
    onlyFollowers INTEGER DEFAULT 0,
    createdAt     TEXT NOT NULL
);

-- 提问表
CREATE TABLE question (
    id         TEXT PRIMARY KEY,
    boxId      TEXT NOT NULL REFERENCES question_box(id),
    askerId    TEXT NOT NULL REFERENCES user(id),
    content    TEXT NOT NULL,
    answer     TEXT,
    answered   INTEGER DEFAULT 0,
    createdAt  TEXT NOT NULL,
    answeredAt TEXT
);

-- ============================================================
--  六、工单表
-- ============================================================

-- 工单表（举报、申诉、权限申请等统一流转）
CREATE TABLE ticket (
    id          TEXT PRIMARY KEY,
    type        TEXT NOT NULL,
    title       TEXT NOT NULL,
    content     TEXT,
    status      TEXT NOT NULL DEFAULT 'open',
    submittedBy TEXT NOT NULL REFERENCES user(id),
    assignedTo  TEXT,
    result      TEXT,
    createdAt   TEXT NOT NULL,
    updatedAt   TEXT NOT NULL
);

-- ============================================================
--  七、板块表
-- ============================================================

-- 板块主表
CREATE TABLE block (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL UNIQUE,
    description TEXT,
    ownerId     TEXT NOT NULL REFERENCES user(id),
    isLocked    INTEGER DEFAULT 0,
    isDeleted   INTEGER DEFAULT 0,
    createdAt   TEXT NOT NULL
);

-- 板块成员表
CREATE TABLE block_member (
    id          TEXT PRIMARY KEY,
    blockId     TEXT NOT NULL REFERENCES block(id),
    userId      TEXT NOT NULL REFERENCES user(id),
    role        TEXT NOT NULL DEFAULT 'member',
    permissions INTEGER NOT NULL DEFAULT 0,
    joinedAt    TEXT NOT NULL,
    UNIQUE(blockId, userId)
);

-- 板块加入申请表
CREATE TABLE block_join_request (
    id         TEXT PRIMARY KEY,
    blockId    TEXT NOT NULL REFERENCES block(id),
    userId     TEXT NOT NULL REFERENCES user(id),
    status     TEXT NOT NULL DEFAULT 'pending',
    reviewedBy TEXT,
    createdAt  TEXT NOT NULL,
    reviewedAt TEXT,
    UNIQUE(blockId, userId)
);

-- 板块黑名单表
CREATE TABLE block_blacklist (
    id        TEXT PRIMARY KEY,
    blockId   TEXT NOT NULL REFERENCES block(id),
    userId    TEXT NOT NULL REFERENCES user(id),
    reason    TEXT,
    createdAt TEXT NOT NULL,
    UNIQUE(blockId, userId)
);

-- ============================================================
--  八、系统表
-- ============================================================

-- 站点运行时配置表（KV 形式）
CREATE TABLE site_config (
    id          TEXT PRIMARY KEY,
    configKey   TEXT NOT NULL UNIQUE,
    configValue TEXT NOT NULL,
    updatedAt   TEXT NOT NULL
);

-- 归档操作记录表
CREATE TABLE archive_operation (
    id            TEXT PRIMARY KEY,
    targetType    TEXT NOT NULL,
    targetId      TEXT NOT NULL,
    operation     TEXT NOT NULL,
    operationData TEXT,
    operatedBy    TEXT,
    createdAt     TEXT NOT NULL
);

-- 管理员操作日志表
CREATE TABLE admin_log (
    id         TEXT PRIMARY KEY,
    adminId    TEXT NOT NULL REFERENCES user(id),
    action     TEXT NOT NULL,
    targetType TEXT NOT NULL,
    targetId   TEXT NOT NULL,
    detail     TEXT,
    createdAt  TEXT NOT NULL
);
