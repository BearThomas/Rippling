/**
 * 管理日志数据访问层
 *
 * 底层表：admin_log
 * 所有管理操作（权限修改、封禁/解封、工单处理等）统一通过
 * writeAdminLog 写入日志，日志公开可见（有 view_admin_log 权限可查询）。
 */

import { generateUUID } from "../utils/uuid";
import { nowISO } from "../utils/time";

// ============================================================
//  类型定义
// ============================================================

/** 写管理日志的输入参数 */
export interface WriteAdminLogData {
  /** 执行操作的管理员 ID */
  adminId: string;
  /** 操作类型（如 edit_permissions / ban_user / handle_ticket） */
  action: string;
  /** 目标类型（user / ticket / post 等） */
  targetType: string;
  /** 目标 ID */
  targetId: string;
  /** 操作详情（JSON 字符串） */
  detail?: string;
}

// ============================================================
//  写入函数
// ============================================================

/**
 * 写管理日志
 *
 * 参数化 INSERT 到 admin_log 表，createdAt 使用 nowISO()。
 */
export async function writeAdminLog(
  db: D1Database,
  data: WriteAdminLogData
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO admin_log (id, adminId, action, targetType, targetId, detail, createdAt)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      generateUUID(),
      data.adminId,
      data.action,
      data.targetType,
      data.targetId,
      data.detail ?? null,
      nowISO()
    )
    .run();
}
