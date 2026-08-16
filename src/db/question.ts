/**
 * 提问箱数据访问层
 *
 * 底层表：question_box, question
 * 规则：未回答的问题仅本人可见。
 */

import type { CurrentUser } from "../utils/permission";
import { generateUUID } from "../utils/uuid";
import { nowISO } from "../utils/time";
import { isFollowing } from "./follow";

// ============================================================
//  返回类型
// ============================================================

/** 提问箱设置 */
export interface QuestionBoxInfo {
  id: string;
  ownerId: string;
  enabled: boolean;
  onlyFollowers: boolean;
}

/** 提问条目 */
export interface QuestionInfo {
  id: string;
  content: string;
  answer: string | null;
  answered: boolean;
  createdAt: string;
  answeredAt: string | null;
}

// ============================================================
//  查询函数
// ============================================================

/** 获取提问箱设置 */
export async function getQuestionBox(
  db: D1Database,
  ownerId: string
): Promise<QuestionBoxInfo | null> {
  const row = await db
    .prepare(
      "SELECT id, ownerId, enabled, onlyFollowers FROM question_box WHERE ownerId = ?"
    )
    .bind(ownerId)
    .first<{
      id: string;
      ownerId: string;
      enabled: number;
      onlyFollowers: number;
    }>();

  if (!row) return null;

  return {
    id: row.id,
    ownerId: row.ownerId,
    enabled: !!row.enabled,
    onlyFollowers: !!row.onlyFollowers,
  };
}

/** 设置提问箱开关和选项 */
export async function setQuestionBoxEnabled(
  db: D1Database,
  ownerId: string,
  enabled: boolean,
  onlyFollowers: boolean
): Promise<void> {
  // 检查是否已有提问箱
  const existing = await db
    .prepare("SELECT id FROM question_box WHERE ownerId = ?")
    .bind(ownerId)
    .first();

  if (existing) {
    await db
      .prepare("UPDATE question_box SET enabled = ?, onlyFollowers = ? WHERE ownerId = ?")
      .bind(enabled ? 1 : 0, onlyFollowers ? 1 : 0, ownerId)
      .run();
  } else {
    await db
      .prepare(
        "INSERT INTO question_box (id, ownerId, enabled, onlyFollowers, createdAt) VALUES (?, ?, ?, ?, ?)"
      )
      .bind(generateUUID(), ownerId, enabled ? 1 : 0, onlyFollowers ? 1 : 0, nowISO())
      .run();
  }
}

/**
 * 向提问箱提问
 *
 * 检查：提问箱是否启用；如果 onlyFollowers=1，检查 askerId 是否关注了 ownerId。
 *
 * @returns 问题 ID，失败返回 null
 */
export async function createQuestion(
  db: D1Database,
  boxId: string,
  askerId: string,
  content: string
): Promise<string | null> {
  // 查询提问箱状态
  const box = await db
    .prepare("SELECT id, ownerId, enabled, onlyFollowers FROM question_box WHERE id = ?")
    .bind(boxId)
    .first<{
      id: string;
      ownerId: string;
      enabled: number;
      onlyFollowers: number;
    }>();

  if (!box || !box.enabled) return null;

  // 仅关注者模式：检查关注关系
  if (box.onlyFollowers) {
    const following = await isFollowing(db, askerId, box.ownerId);
    if (!following) return null;
  }

  const id = generateUUID();
  const now = nowISO();

  await db
    .prepare(
      `INSERT INTO question (id, boxId, askerId, content, answered, isDeleted, createdAt)
       VALUES (?, ?, ?, ?, 0, 0, ?)`
    )
    .bind(id, boxId, askerId, content, now)
    .run();

  return id;
}

/**
 * 回答问题
 *
 * 检查问题属于该 owner。
 *
 * @returns false 表示问题不属于该 owner 或问题不存在
 */
export async function answerQuestion(
  db: D1Database,
  questionId: string,
  answer: string,
  ownerId: string
): Promise<boolean> {
  // 验证问题归属
  const question = await db
    .prepare(
      `SELECT q.id FROM question q
       JOIN question_box qb ON q.boxId = qb.id
       WHERE q.id = ? AND qb.ownerId = ?`
    )
    .bind(questionId, ownerId)
    .first();

  if (!question) return false;

  const now = nowISO();

  await db
    .prepare("UPDATE question SET answer = ?, answered = 1, answeredAt = ? WHERE id = ?")
    .bind(answer, now, questionId)
    .run();

  return true;
}

/**
 * 列出提问箱的问题
 *
 * 已回答的问题对所有人可见；未回答的问题仅 owner 本人可见。
 */
export async function listQuestions(
  db: D1Database,
  ownerId: string,
  user: CurrentUser | null,
  limit: number,
  offset: number
): Promise<QuestionInfo[]> {
  const isOwner = user?.id === ownerId;

  let sql: string;
  let params: unknown[];

  if (isOwner) {
    // owner 可看到所有未删除问题（含未回答）
    sql = `SELECT q.id, q.content, q.answer, q.answered, q.createdAt, q.answeredAt
           FROM question q
           JOIN question_box qb ON q.boxId = qb.id
           WHERE qb.ownerId = ? AND q.isDeleted = 0
           ORDER BY q.createdAt DESC LIMIT ? OFFSET ?`;
    params = [ownerId, limit, offset];
  } else {
    // 非 owner 仅看到已回答且未删除的问题
    sql = `SELECT q.id, q.content, q.answer, q.answered, q.createdAt, q.answeredAt
           FROM question q
           JOIN question_box qb ON q.boxId = qb.id
           WHERE qb.ownerId = ? AND q.answered = 1 AND q.isDeleted = 0
           ORDER BY q.answeredAt DESC LIMIT ? OFFSET ?`;
    params = [ownerId, limit, offset];
  }

  const rows = await db
    .prepare(sql)
    .bind(...params)
    .all<{
      id: string;
      content: string;
      answer: string | null;
      answered: number;
      createdAt: string;
      answeredAt: string | null;
    }>();

  return rows.results.map((r) => ({
    id: r.id,
    content: r.content,
    answer: r.answer,
    answered: !!r.answered,
    createdAt: r.createdAt,
    answeredAt: r.answeredAt,
  }));
}

/**
 * 软删除问题
 *
 * 验证问题属于 ownerId，不物理删除。
 * 在 archive_operation 表记录操作，同时标记 isDeleted = 1。
 *
 * @returns false 表示问题不存在或不属于该 owner
 */
export async function softDeleteQuestion(
  db: D1Database,
  questionId: string,
  ownerId: string
): Promise<boolean> {
  // 验证问题归属
  const question = await db
    .prepare(
      `SELECT q.id FROM question q
       JOIN question_box qb ON q.boxId = qb.id
       WHERE q.id = ? AND qb.ownerId = ? AND q.isDeleted = 0`
    )
    .bind(questionId, ownerId)
    .first();

  if (!question) return false;

  const now = nowISO();

  // 标记删除
  await db
    .prepare("UPDATE question SET isDeleted = 1 WHERE id = ?")
    .bind(questionId)
    .run();

  // 记录到 archive_operation
  await db
    .prepare(
      `INSERT INTO archive_operation (id, targetType, targetId, operation, operatedBy, createdAt)
       VALUES (?, 'question', ?, 'delete', ?, ?)`
    )
    .bind(generateUUID(), questionId, ownerId, now)
    .run();

  return true;
}
