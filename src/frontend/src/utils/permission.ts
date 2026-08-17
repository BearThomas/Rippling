/**
 * 权限工具
 *
 * 与后端 src/shared/permissions.ts 的权限位定义保持一致（位 0-37）。
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
