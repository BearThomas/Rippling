/**
 * 投票数据访问层
 *
 * 底层表：vote, vote_option, vote_record
 * 规则：isRealTimeVisible=0 且未结束时不返回结果。
 */

import type { CurrentUser } from "../utils/permission";
import { can } from "../utils/permission";
import { PERM_CREATE_VOTE } from "../shared/permissions";
import { generateUUID } from "../utils/uuid";
import { nowISO } from "../utils/time";

// ============================================================
//  返回类型
// ============================================================

/** 投票选项（含当前票数） */
export interface VoteOptionInfo {
  id: string;
  content: string;
  voteCount: number;
}

/** 投票详情 */
export interface VoteInfo {
  id: string;
  title: string;
  description: string | null;
  isMultiple: boolean;
  isRealTimeVisible: boolean;
  endAt: string;
  createdBy: string;
  isClosed: boolean;
  createdAt: string;
  options: VoteOptionInfo[];
  /** 是否已显示结果（realTimeVisible 或已结束） */
  resultsVisible: boolean;
}

/** 创建投票的输入参数 */
export interface CreateVoteData {
  title: string;
  description?: string | null;
  isMultiple?: boolean;
  isRealTimeVisible?: boolean;
  endAt: string;
  options: string[];
}

// ============================================================
//  查询函数
// ============================================================

/**
 * 创建投票（含选项）
 *
 * 需要 create_vote 权限。
 *
 * @returns 投票 ID，无权限返回 null
 */
export async function createVote(
  db: D1Database,
  data: CreateVoteData,
  user: CurrentUser | null
): Promise<string | null> {
  if (!can(user, PERM_CREATE_VOTE)) return null;
  if (!user) return null;

  const voteId = generateUUID();
  const now = nowISO();

  await db
    .prepare(
      `INSERT INTO vote (id, title, description, isMultiple, isRealTimeVisible, endAt, createdBy, createdAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      voteId,
      data.title,
      data.description ?? null,
      data.isMultiple ? 1 : 0,
      data.isRealTimeVisible !== false ? 1 : 0,
      data.endAt,
      user.id,
      now
    )
    .run();

  // 插入选项
  for (const content of data.options) {
    await db
      .prepare("INSERT INTO vote_option (id, voteId, content, createdAt) VALUES (?, ?, ?, ?)")
      .bind(generateUUID(), voteId, content, now)
      .run();
  }

  return voteId;
}

/**
 * 获取投票详情
 *
 * 如果 isRealTimeVisible=0 且未结束 → 不返回选项票数。
 */
export async function getVoteById(
  db: D1Database,
  id: string,
  _user: CurrentUser | null
): Promise<VoteInfo | null> {
  const vote = await db
    .prepare(
      `SELECT id, title, description, isMultiple, isRealTimeVisible, endAt, createdBy, isClosed, createdAt
       FROM vote WHERE id = ?`
    )
    .bind(id)
    .first<{
      id: string;
      title: string;
      description: string | null;
      isMultiple: number;
      isRealTimeVisible: number;
      endAt: string;
      createdBy: string;
      isClosed: number;
      createdAt: string;
    }>();

  if (!vote) return null;

  // 查询选项
  const options = await db
    .prepare("SELECT id, content FROM vote_option WHERE voteId = ?")
    .bind(id)
    .all<{ id: string; content: string }>();

  const isClosed = !!vote.isClosed;
  const isExpired = new Date(vote.endAt) <= new Date();
  const resultsVisible = !!vote.isRealTimeVisible || isClosed || isExpired;

  // 查询各选项票数
  const optionInfos: VoteOptionInfo[] = [];
  for (const opt of options.results) {
    const countRow = await db
      .prepare("SELECT COUNT(*) as count FROM vote_record WHERE optionId = ?")
      .bind(opt.id)
      .first<{ count: number }>();

    optionInfos.push({
      id: opt.id,
      content: opt.content,
      voteCount: resultsVisible ? (countRow?.count ?? 0) : 0,
    });
  }

  return {
    id: vote.id,
    title: vote.title,
    description: vote.description,
    isMultiple: !!vote.isMultiple,
    isRealTimeVisible: !!vote.isRealTimeVisible,
    endAt: vote.endAt,
    createdBy: vote.createdBy,
    isClosed,
    createdAt: vote.createdAt,
    options: optionInfos,
    resultsVisible,
  };
}

/**
 * 投票
 *
 * 检查是否已投（UNIQUE voteId+userId）和截止时间。
 *
 * @returns false 表示已投过或已截止
 */
export async function castVote(
  db: D1Database,
  voteId: string,
  optionId: string,
  userId: string
): Promise<boolean> {
  // 检查投票是否存在及截止状态
  const vote = await db
    .prepare("SELECT endAt, isClosed FROM vote WHERE id = ?")
    .bind(voteId)
    .first<{ endAt: string; isClosed: number }>();

  if (!vote) return false;
  if (vote.isClosed) return false;
  if (new Date(vote.endAt) <= new Date()) return false;

  // 检查是否已投
  const existing = await db
    .prepare("SELECT id FROM vote_record WHERE voteId = ? AND userId = ?")
    .bind(voteId, userId)
    .first();

  if (existing) return false;

  // 写入投票记录
  await db
    .prepare(
      "INSERT INTO vote_record (id, voteId, optionId, userId, createdAt) VALUES (?, ?, ?, ?, ?)"
    )
    .bind(generateUUID(), voteId, optionId, userId, nowISO())
    .run();

  return true;
}

/**
 * 关闭投票
 *
 * 创建者本人或管理员（handle_ticket 权限代理）可关闭。
 *
 * @returns false 表示无权限或投票不存在
 */
export async function closeVote(
  db: D1Database,
  id: string,
  user: CurrentUser | null
): Promise<boolean> {
  if (!user) return false;

  const vote = await db
    .prepare("SELECT createdBy FROM vote WHERE id = ?")
    .bind(id)
    .first<{ createdBy: string }>();

  if (!vote) return false;

  const isCreator = vote.createdBy === user.id;
  // 管理员可通过 handle_ticket 权限关闭（代理管理）
  const isAdmin = can(user, PERM_CREATE_VOTE) && user.id !== vote.createdBy;

  if (!isCreator && !isAdmin) return false;

  await db
    .prepare("UPDATE vote SET isClosed = 1 WHERE id = ?")
    .bind(id)
    .run();

  return true;
}
