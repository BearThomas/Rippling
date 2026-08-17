/**
 * 权限工具
 *
 * 与后端 src/shared/permissions.ts 的权限位定义保持一致（全站位 0-37，板块位 0-14）。
 * 后端权限掩码以十进制字符串返回（BigInt 无法 JSON 序列化），
 * hasPermission 同时接受 bigint / 十进制字符串 / 数字。
 */

// ============================================================
//  全站权限位（0-37），与后端一一对应
// ============================================================

export const PERM_VIEW_SITE = 0;
export const PERM_CREATE_POST = 1;
export const PERM_COMMENT = 2;
export const PERM_LIKE = 3;
export const PERM_EDIT_OWN_POST = 4;
export const PERM_DELETE_OWN_POST = 5;
export const PERM_EDIT_OTHERS_POST = 6;
export const PERM_DELETE_OTHERS_POST = 7;
export const PERM_PIN_POST = 8;
export const PERM_CREATE_CONFESSION = 9;
export const PERM_VIEW_CONFESSION = 10;
export const PERM_VIEW_POST = 11;
export const PERM_VIEW_TIMELINE = 12;
export const PERM_SUBMIT_TIMELINE = 13;
export const PERM_REVIEW_TIMELINE = 14;
export const PERM_EDIT_OTHERS_PERMISSION = 15;
export const PERM_ACCESS_ADMIN_PANEL = 16;
export const PERM_VIEW_DATABASE = 17;
export const PERM_EDIT_DATABASE = 18;
export const PERM_SUBMIT_PERMISSION_REQUEST = 19;
export const PERM_SUBMIT_REPORT = 20;
export const PERM_SUBMIT_APPEAL = 21;
export const PERM_SUBMIT_BLOCK_CREATE = 22;
export const PERM_MANAGE_BLOCK = 23;
export const PERM_VIEW_TICKET = 24;
export const PERM_HANDLE_TICKET = 25;
export const PERM_MODIFY_OWN_USERNAME = 26;
export const PERM_SET_NAME_BADGE = 27;
export const PERM_SUBMIT_VERIFICATION = 28;
export const PERM_MODIFY_PASSWORD = 29;
export const PERM_FOLLOW_USER = 30;
export const PERM_ENABLE_QUESTION_BOX = 31;
export const PERM_VIEW_QUESTION_BOX = 32;
export const PERM_ASK_QUESTION = 33;
export const PERM_VIEW_ANONYMOUS_IDENTITY = 34;
export const PERM_VIEW_ADMIN_LOG = 35;
export const PERM_UPLOAD_IMAGE = 36;
export const PERM_CREATE_VOTE = 37;

// ============================================================
//  板块权限位（0-14），与后端 shared/permissions.ts 一致
// ============================================================

export const BLOCK_PERM_VIEW = 0;
export const BLOCK_PERM_CREATE_POST = 1;
export const BLOCK_PERM_COMMENT = 2;
export const BLOCK_PERM_LIKE = 3;
export const BLOCK_PERM_EDIT_OWN_POST = 4;
export const BLOCK_PERM_DELETE_OWN_POST = 5;
export const BLOCK_PERM_EDIT_OTHERS_POST = 6;
export const BLOCK_PERM_DELETE_OTHERS_POST = 7;
export const BLOCK_PERM_PIN_POST = 8;
export const BLOCK_PERM_APPROVE_JOIN = 9;
export const BLOCK_PERM_MANAGE_MEMBER = 10;
export const BLOCK_PERM_MANAGE_ROLE = 11;
export const BLOCK_PERM_UPLOAD_IMAGE = 12;
export const BLOCK_PERM_DELETE = 13;
export const BLOCK_PERM_TRANSFER = 14;

/** 板块权限位元信息（用于权限编辑弹窗展示） */
export const BLOCK_PERMISSION_BITS: { bit: number; label: string }[] = [
  { bit: BLOCK_PERM_VIEW, label: "浏览板块" },
  { bit: BLOCK_PERM_CREATE_POST, label: "发帖" },
  { bit: BLOCK_PERM_COMMENT, label: "评论" },
  { bit: BLOCK_PERM_LIKE, label: "点赞" },
  { bit: BLOCK_PERM_EDIT_OWN_POST, label: "编辑自己的帖子" },
  { bit: BLOCK_PERM_DELETE_OWN_POST, label: "删除自己的帖子" },
  { bit: BLOCK_PERM_EDIT_OTHERS_POST, label: "编辑他人帖子" },
  { bit: BLOCK_PERM_DELETE_OTHERS_POST, label: "删除他人帖子" },
  { bit: BLOCK_PERM_PIN_POST, label: "置顶帖子" },
  { bit: BLOCK_PERM_APPROVE_JOIN, label: "审批加入申请" },
  { bit: BLOCK_PERM_MANAGE_MEMBER, label: "管理成员" },
  { bit: BLOCK_PERM_MANAGE_ROLE, label: "修改成员权限" },
  { bit: BLOCK_PERM_UPLOAD_IMAGE, label: "上传图片" },
  { bit: BLOCK_PERM_DELETE, label: "删除板块" },
  { bit: BLOCK_PERM_TRANSFER, label: "转让板块" },
];

// ============================================================
//  工具函数
// ============================================================

/**
 * 将权限值归一化为 bigint
 *
 * @param permissions bigint / 十进制字符串（后端响应格式）/ 数字
 */
export function toPermissionsBigInt(
  permissions: bigint | string | number
): bigint {
  if (typeof permissions === "bigint") return permissions;
  try {
    return BigInt(permissions);
  } catch {
    return 0n;
  }
}

/**
 * 检查权限中是否包含指定位
 *
 * @param permissions 权限掩码（bigint 或十进制字符串）
 * @param bit         权限位位置（如 PERM_CREATE_POST）
 */
export function hasPermission(
  permissions: bigint | string | number,
  bit: number
): boolean {
  const mask = 1n << BigInt(bit);
  return (toPermissionsBigInt(permissions) & mask) === mask;
}
