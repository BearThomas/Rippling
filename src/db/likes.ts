/**
 * 点赞数据访问层
 *
 * 多态点赞：通过 targetType 区分帖子、评论、表白墙等。
 * 底层表：likes（UNIQUE targetType + targetId + userId）
 */

import { generateUUID } from "../utils/uuid";
import { nowISO } from "../utils/time";

/**
 * 切换点赞状态
 *
 * 已点赞 → 取消赞（删除记录）
 * 未点赞 → 点赞（插入记录）
 *
 * @returns 当前点赞状态和该目标的总赞数
 */
export async function toggleLike(
  db: D1Database,
  targetType: string,
  targetId: string,
  userId: string
): Promise<{ liked: boolean; count: number }> {
  const existing = await db
    .prepare(
      "SELECT id FROM likes WHERE targetType = ? AND targetId = ? AND userId = ?"
    )
    .bind(targetType, targetId, userId)
    .first();

  if (existing) {
    // 已点赞 → 取消
    await db
      .prepare("DELETE FROM likes WHERE id = ?")
      .bind(existing.id)
      .run();
  } else {
    // 未点赞 → 点赞
    await db
      .prepare(
        "INSERT INTO likes (id, targetType, targetId, userId, createdAt) VALUES (?, ?, ?, ?, ?)"
      )
      .bind(generateUUID(), targetType, targetId, userId, nowISO())
      .run();
  }

  // 查询最新总数
  const countRow = await db
    .prepare(
      "SELECT COUNT(*) as count FROM likes WHERE targetType = ? AND targetId = ?"
    )
    .bind(targetType, targetId)
    .first<{ count: number }>();

  return {
    liked: !existing,
    count: countRow?.count ?? 0,
  };
}

/** 获取指定目标的点赞总数 */
export async function getLikeCount(
  db: D1Database,
  targetType: string,
  targetId: string
): Promise<number> {
  const row = await db
    .prepare(
      "SELECT COUNT(*) as count FROM likes WHERE targetType = ? AND targetId = ?"
    )
    .bind(targetType, targetId)
    .first<{ count: number }>();

  return row?.count ?? 0;
}

/** 检查指定用户是否已点赞 */
export async function getUserLiked(
  db: D1Database,
  userId: string,
  targetType: string,
  targetId: string
): Promise<boolean> {
  const row = await db
    .prepare(
      "SELECT id FROM likes WHERE targetType = ? AND targetId = ? AND userId = ?"
    )
    .bind(targetType, targetId, userId)
    .first();

  return !!row;
}
