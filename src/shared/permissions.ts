/**
 * Rippling 权限位掩码定义
 *
 * 使用 BigInt 位运算，支持最多 64 个独立权限。
 * 每个权限以"位位置"（bit position）定义，对应掩码值 = 1n << BigInt(bit)。
 *
 * 后续 Task 会将这些常量持久化到数据库并用于鉴权中间件。
 */

// ============================================================
//  全站权限 — 位位置 (0-37)
// ============================================================

/** 进入站点 */
export const PERM_VIEW_SITE = 0;
/** 发帖 */
export const PERM_CREATE_POST = 1;
/** 评论 */
export const PERM_COMMENT = 2;
/** 点赞 */
export const PERM_LIKE = 3;
/** 编辑自己的帖子 */
export const PERM_EDIT_OWN_POST = 4;
/** 删除自己的帖子 */
export const PERM_DELETE_OWN_POST = 5;
/** 编辑他人帖子 */
export const PERM_EDIT_OTHERS_POST = 6;
/** 删除他人帖子 */
export const PERM_DELETE_OTHERS_POST = 7;
/** 置顶帖子 */
export const PERM_PIN_POST = 8;
/** 发布表白墙 */
export const PERM_CREATE_CONFESSION = 9;
/** 查看表白墙 */
export const PERM_VIEW_CONFESSION = 10;
/** 查看帖子 */
export const PERM_VIEW_POST = 11;
/** 查看大事记 */
export const PERM_VIEW_TIMELINE = 12;
/** 提交大事记 */
export const PERM_SUBMIT_TIMELINE = 13;
/** 审核大事记 */
export const PERM_REVIEW_TIMELINE = 14;
/** 编辑他人权限 */
export const PERM_EDIT_OTHERS_PERMISSION = 15;
/** 进入管理面板 */
export const PERM_ACCESS_ADMIN_PANEL = 16;
/** 查看数据库 */
export const PERM_VIEW_DATABASE = 17;
/** 执行 SQL */
export const PERM_EDIT_DATABASE = 18;
/** 提交权限申请 */
export const PERM_SUBMIT_PERMISSION_REQUEST = 19;
/** 提交举报 */
export const PERM_SUBMIT_REPORT = 20;
/** 提交申诉 */
export const PERM_SUBMIT_APPEAL = 21;
/** 提交创建板块申请 */
export const PERM_SUBMIT_BLOCK_CREATE = 22;
/** 全站板块管理 */
export const PERM_MANAGE_BLOCK = 23;
/** 查看工单 */
export const PERM_VIEW_TICKET = 24;
/** 处理工单 */
export const PERM_HANDLE_TICKET = 25;
/** 修改用户名 */
export const PERM_MODIFY_OWN_USERNAME = 26;
/** 设置昵称徽章 */
export const PERM_SET_NAME_BADGE = 27;
/** 提交认证 */
export const PERM_SUBMIT_VERIFICATION = 28;
/** 修改密码 */
export const PERM_MODIFY_PASSWORD = 29;
/** 关注他人 */
export const PERM_FOLLOW_USER = 30;
/** 启用提问箱 */
export const PERM_ENABLE_QUESTION_BOX = 31;
/** 查看提问箱 */
export const PERM_VIEW_QUESTION_BOX = 32;
/** 向提问箱提问 */
export const PERM_ASK_QUESTION = 33;
/** 查看匿名身份 */
export const PERM_VIEW_ANONYMOUS_IDENTITY = 34;
/** 查看管理日志 */
export const PERM_VIEW_ADMIN_LOG = 35;
/** 发布图片 */
export const PERM_UPLOAD_IMAGE = 36;
/** 创建投票 */
export const PERM_CREATE_VOTE = 37;

// ============================================================
//  全站权限 — 掩码 (BigInt)
// ============================================================

export const MASK_VIEW_SITE                       = 1n << BigInt(PERM_VIEW_SITE);
export const MASK_CREATE_POST                     = 1n << BigInt(PERM_CREATE_POST);
export const MASK_COMMENT                         = 1n << BigInt(PERM_COMMENT);
export const MASK_LIKE                            = 1n << BigInt(PERM_LIKE);
export const MASK_EDIT_OWN_POST                   = 1n << BigInt(PERM_EDIT_OWN_POST);
export const MASK_DELETE_OWN_POST                 = 1n << BigInt(PERM_DELETE_OWN_POST);
export const MASK_EDIT_OTHERS_POST                = 1n << BigInt(PERM_EDIT_OTHERS_POST);
export const MASK_DELETE_OTHERS_POST              = 1n << BigInt(PERM_DELETE_OTHERS_POST);
export const MASK_PIN_POST                        = 1n << BigInt(PERM_PIN_POST);
export const MASK_CREATE_CONFESSION               = 1n << BigInt(PERM_CREATE_CONFESSION);
export const MASK_VIEW_CONFESSION                 = 1n << BigInt(PERM_VIEW_CONFESSION);
export const MASK_VIEW_POST                       = 1n << BigInt(PERM_VIEW_POST);
export const MASK_VIEW_TIMELINE                   = 1n << BigInt(PERM_VIEW_TIMELINE);
export const MASK_SUBMIT_TIMELINE                 = 1n << BigInt(PERM_SUBMIT_TIMELINE);
export const MASK_REVIEW_TIMELINE                 = 1n << BigInt(PERM_REVIEW_TIMELINE);
export const MASK_EDIT_OTHERS_PERMISSION          = 1n << BigInt(PERM_EDIT_OTHERS_PERMISSION);
export const MASK_ACCESS_ADMIN_PANEL              = 1n << BigInt(PERM_ACCESS_ADMIN_PANEL);
export const MASK_VIEW_DATABASE                   = 1n << BigInt(PERM_VIEW_DATABASE);
export const MASK_EDIT_DATABASE                   = 1n << BigInt(PERM_EDIT_DATABASE);
export const MASK_SUBMIT_PERMISSION_REQUEST       = 1n << BigInt(PERM_SUBMIT_PERMISSION_REQUEST);
export const MASK_SUBMIT_REPORT                   = 1n << BigInt(PERM_SUBMIT_REPORT);
export const MASK_SUBMIT_APPEAL                   = 1n << BigInt(PERM_SUBMIT_APPEAL);
export const MASK_SUBMIT_BLOCK_CREATE             = 1n << BigInt(PERM_SUBMIT_BLOCK_CREATE);
export const MASK_MANAGE_BLOCK                    = 1n << BigInt(PERM_MANAGE_BLOCK);
export const MASK_VIEW_TICKET                     = 1n << BigInt(PERM_VIEW_TICKET);
export const MASK_HANDLE_TICKET                   = 1n << BigInt(PERM_HANDLE_TICKET);
export const MASK_MODIFY_OWN_USERNAME             = 1n << BigInt(PERM_MODIFY_OWN_USERNAME);
export const MASK_SET_NAME_BADGE                  = 1n << BigInt(PERM_SET_NAME_BADGE);
export const MASK_SUBMIT_VERIFICATION             = 1n << BigInt(PERM_SUBMIT_VERIFICATION);
export const MASK_MODIFY_PASSWORD                 = 1n << BigInt(PERM_MODIFY_PASSWORD);
export const MASK_FOLLOW_USER                     = 1n << BigInt(PERM_FOLLOW_USER);
export const MASK_ENABLE_QUESTION_BOX             = 1n << BigInt(PERM_ENABLE_QUESTION_BOX);
export const MASK_VIEW_QUESTION_BOX               = 1n << BigInt(PERM_VIEW_QUESTION_BOX);
export const MASK_ASK_QUESTION                    = 1n << BigInt(PERM_ASK_QUESTION);
export const MASK_VIEW_ANONYMOUS_IDENTITY         = 1n << BigInt(PERM_VIEW_ANONYMOUS_IDENTITY);
export const MASK_VIEW_ADMIN_LOG                  = 1n << BigInt(PERM_VIEW_ADMIN_LOG);
export const MASK_UPLOAD_IMAGE                    = 1n << BigInt(PERM_UPLOAD_IMAGE);
export const MASK_CREATE_VOTE                     = 1n << BigInt(PERM_CREATE_VOTE);

// ============================================================
//  板块权限 — 位位置 (0-14)
// ============================================================

/** 查看板块 */
export const BLOCK_PERM_VIEW = 0;
/** 板块发帖 */
export const BLOCK_PERM_CREATE_POST = 1;
/** 板块评论 */
export const BLOCK_PERM_COMMENT = 2;
/** 板块点赞 */
export const BLOCK_PERM_LIKE = 3;
/** 编辑自己板块帖子 */
export const BLOCK_PERM_EDIT_OWN_POST = 4;
/** 删除自己板块帖子 */
export const BLOCK_PERM_DELETE_OWN_POST = 5;
/** 编辑他人板块帖子 */
export const BLOCK_PERM_EDIT_OTHERS_POST = 6;
/** 删除他人板块帖子 */
export const BLOCK_PERM_DELETE_OTHERS_POST = 7;
/** 板块置顶 */
export const BLOCK_PERM_PIN_POST = 8;
/** 审核加入 */
export const BLOCK_PERM_APPROVE_JOIN = 9;
/** 管理成员 */
export const BLOCK_PERM_MANAGE_MEMBER = 10;
/** 管理成员权限 */
export const BLOCK_PERM_MANAGE_ROLE = 11;
/** 板块发图 */
export const BLOCK_PERM_UPLOAD_IMAGE = 12;
/** 删除板块 */
export const BLOCK_PERM_DELETE = 13;
/** 转让板块 */
export const BLOCK_PERM_TRANSFER = 14;

// ============================================================
//  板块权限 — 掩码 (BigInt)
// ============================================================

export const BLOCK_MASK_VIEW              = 1n << BigInt(BLOCK_PERM_VIEW);
export const BLOCK_MASK_CREATE_POST       = 1n << BigInt(BLOCK_PERM_CREATE_POST);
export const BLOCK_MASK_COMMENT           = 1n << BigInt(BLOCK_PERM_COMMENT);
export const BLOCK_MASK_LIKE              = 1n << BigInt(BLOCK_PERM_LIKE);
export const BLOCK_MASK_EDIT_OWN_POST     = 1n << BigInt(BLOCK_PERM_EDIT_OWN_POST);
export const BLOCK_MASK_DELETE_OWN_POST   = 1n << BigInt(BLOCK_PERM_DELETE_OWN_POST);
export const BLOCK_MASK_EDIT_OTHERS_POST  = 1n << BigInt(BLOCK_PERM_EDIT_OTHERS_POST);
export const BLOCK_MASK_DELETE_OTHERS_POST = 1n << BigInt(BLOCK_PERM_DELETE_OTHERS_POST);
export const BLOCK_MASK_PIN_POST          = 1n << BigInt(BLOCK_PERM_PIN_POST);
export const BLOCK_MASK_APPROVE_JOIN      = 1n << BigInt(BLOCK_PERM_APPROVE_JOIN);
export const BLOCK_MASK_MANAGE_MEMBER     = 1n << BigInt(BLOCK_PERM_MANAGE_MEMBER);
export const BLOCK_MASK_MANAGE_ROLE       = 1n << BigInt(BLOCK_PERM_MANAGE_ROLE);
export const BLOCK_MASK_UPLOAD_IMAGE      = 1n << BigInt(BLOCK_PERM_UPLOAD_IMAGE);
export const BLOCK_MASK_DELETE            = 1n << BigInt(BLOCK_PERM_DELETE);
export const BLOCK_MASK_TRANSFER          = 1n << BigInt(BLOCK_PERM_TRANSFER);

// ============================================================
//  角色默认权限组合
// ============================================================

/** 游客：浏览站点、查看帖子、查看表白墙、查看大事记、查看提问箱、点赞、评论、提交举报/申诉/权限申请/创建板块申请、发布图片 */
export const ROLE_GUEST =
  MASK_VIEW_SITE |
  MASK_VIEW_POST |
  MASK_VIEW_CONFESSION |
  MASK_VIEW_TIMELINE |
  MASK_VIEW_QUESTION_BOX |
  MASK_LIKE |
  MASK_COMMENT |
  MASK_SUBMIT_REPORT |
  MASK_SUBMIT_APPEAL |
  MASK_SUBMIT_PERMISSION_REQUEST |
  MASK_SUBMIT_BLOCK_CREATE |
  MASK_UPLOAD_IMAGE;

/** 注册用户：游客权限 + 发帖、编辑/删除自己的帖子、发布表白墙、提交大事记、修改用户名/密码、关注他人、启用提问箱、向提问箱提问、创建投票、提交认证 */
export const ROLE_USER =
  ROLE_GUEST |
  MASK_CREATE_POST |
  MASK_EDIT_OWN_POST |
  MASK_DELETE_OWN_POST |
  MASK_CREATE_CONFESSION |
  MASK_SUBMIT_TIMELINE |
  MASK_MODIFY_OWN_USERNAME |
  MASK_MODIFY_PASSWORD |
  MASK_FOLLOW_USER |
  MASK_ENABLE_QUESTION_BOX |
  MASK_ASK_QUESTION |
  MASK_CREATE_VOTE |
  MASK_SUBMIT_VERIFICATION;

/** 认证用户：用户权限 + 设置昵称徽章、提交认证 */
export const ROLE_VERIFIED =
  ROLE_USER |
  MASK_SET_NAME_BADGE |
  MASK_SUBMIT_VERIFICATION;

/** 管理员：认证用户权限 + 管理面板、编辑/删除他人帖子、置顶、审核大事记、板块管理、查看/处理工单、查看匿名身份、查看管理日志、查看数据库 */
export const ROLE_ADMIN =
  ROLE_VERIFIED |
  MASK_ACCESS_ADMIN_PANEL |
  MASK_EDIT_OTHERS_POST |
  MASK_DELETE_OTHERS_POST |
  MASK_PIN_POST |
  MASK_REVIEW_TIMELINE |
  MASK_MANAGE_BLOCK |
  MASK_VIEW_TICKET |
  MASK_HANDLE_TICKET |
  MASK_VIEW_ANONYMOUS_IDENTITY |
  MASK_VIEW_ADMIN_LOG |
  MASK_VIEW_DATABASE;

/** 超级管理员：全部权限（所有位为 1） */
export const ROLE_SUPER_ADMIN =
  ROLE_ADMIN |
  MASK_EDIT_OTHERS_PERMISSION |
  MASK_EDIT_DATABASE;

/**
 * 新注册用户默认权限（与注册流程一致的基础权限位）
 *
 * 用途：
 *   - 注册成功后创建 user_profile 的初始权限
 *   - 解封用户（unban）时恢复的默认权限
 *   - 申诉工单批准时恢复的基准（ROLE_USER 为其超集）
 */
export const DEFAULT_USER_PERMISSIONS =
  MASK_VIEW_SITE |
  MASK_CREATE_POST |
  MASK_COMMENT |
  MASK_LIKE |
  MASK_EDIT_OWN_POST |
  MASK_DELETE_OWN_POST |
  MASK_CREATE_CONFESSION |
  MASK_VIEW_CONFESSION |
  MASK_VIEW_POST |
  MASK_VIEW_TIMELINE |
  MASK_SUBMIT_PERMISSION_REQUEST |
  MASK_SUBMIT_REPORT |
  MASK_SUBMIT_APPEAL |
  MASK_MODIFY_OWN_USERNAME |
  MASK_MODIFY_PASSWORD |
  MASK_FOLLOW_USER |
  MASK_ENABLE_QUESTION_BOX |
  MASK_VIEW_QUESTION_BOX |
  MASK_ASK_QUESTION |
  MASK_UPLOAD_IMAGE;

// ============================================================
//  工具函数
// ============================================================

/** 检查 permissions 中是否包含指定权限 */
export function hasPermission(permissions: bigint, mask: bigint): boolean {
  return (permissions & mask) === mask;
}

/** 为 permissions 添加指定权限 */
export function addPermission(permissions: bigint, mask: bigint): bigint {
  return permissions | mask;
}

/** 从 permissions 中移除指定权限 */
export function removePermission(permissions: bigint, mask: bigint): bigint {
  return permissions & ~mask;
}
