/**
 * 关注数据访问层
 *
 * 底层表：follow（UNIQUE followerId + followingId）
 */

import { generateUUID } from "../utils/uuid";
import { nowISO } from "../utils/time";

/** 关注用户 */
export async function followUser(
  db: D1Database,
  followerId: string,
  followingId: string
): Promise<void> {
  // 不允许关注自己
  if (followerId === followingId) return;

  await db
    .prepare(
      "INSERT INTO follow (id, followerId, followingId, createdAt) VALUES (?, ?, ?, ?)"
    )
    .bind(generateUUID(), followerId, followingId, nowISO())
    .run();
}

/** 取消关注 */
export async function unfollowUser(
  db: D1Database,
  followerId: string,
  followingId: string
): Promise<void> {
  await db
    .prepare("DELETE FROM follow WHERE followerId = ? AND followingId = ?")
    .bind(followerId, followingId)
    .run();
}

/** 检查是否已关注 */
export async function isFollowing(
  db: D1Database,
  followerId: string,
  followingId: string
): Promise<boolean> {
  const row = await db
    .prepare("SELECT id FROM follow WHERE followerId = ? AND followingId = ?")
    .bind(followerId, followingId)
    .first();

  return !!row;
}

/** 获取粉丝列表（谁关注了该用户） */
export async function listFollowers(
  db: D1Database,
  userId: string,
  limit: number,
  offset: number
): Promise<Array<{ id: string; followerId: string; createdAt: string }>> {
  const rows = await db
    .prepare(
      "SELECT id, followerId, createdAt FROM follow WHERE followingId = ? ORDER BY createdAt DESC LIMIT ? OFFSET ?"
    )
    .bind(userId, limit, offset)
    .all<{ id: string; followerId: string; createdAt: string }>();

  return rows.results;
}

/** 获取关注列表（该用户关注了谁） */
export async function listFollowing(
  db: D1Database,
  userId: string,
  limit: number,
  offset: number
): Promise<Array<{ id: string; followingId: string; createdAt: string }>> {
  const rows = await db
    .prepare(
      "SELECT id, followingId, createdAt FROM follow WHERE followerId = ? ORDER BY createdAt DESC LIMIT ? OFFSET ?"
    )
    .bind(userId, limit, offset)
    .all<{ id: string; followingId: string; createdAt: string }>();

  return rows.results;
}
