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

/** 投票选项（含当前票数，不可见时为 null） */
export interface VoteOptionInfo {
  id: string;
  content: string;
  voteCount: number | null;
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
  /** 当前用户已投的选项 ID 列表（未投票或无用户时为 null） */
  myVote: string[] | null;
}

/** 投票列表条目 */
export interface VoteListItem {
  id: string;
  title: string;
  description: string | null;
  endAt: string;
  isClosed: boolean;
  createdAt: string;
  totalVotes: number | null;
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
 * 列出所有投票（按创建时间倒序）
 *
 * 统计总票数。如果 isRealTimeVisible=0 且未结束，totalVotes 返回 null。
 */
export async function listVotes(
  db: D1Database,
  limit: number,
  offset: number
): Promise<VoteListItem[]> {
  const rows = await db
    .prepare(
      `SELECT id, title, description, endAt, isClosed, createdAt, isRealTimeVisible
       FROM vote ORDER BY createdAt DESC LIMIT ? OFFSET ?`
    )
    .bind(limit, offset)
    .all<{
      id: string;
      title: string;
      description: string | null;
      endAt: string;
      isClosed: number;
      createdAt: string;
      isRealTimeVisible: number;
    }>();

  const results: VoteListItem[] = [];
  for (const row of rows.results) {
    const isClosed = !!row.isClosed;
    const isExpired = new Date(row.endAt) <= new Date();
    const resultsVisible = !!row.isRealTimeVisible || isClosed || isExpired;

    let totalVotes: number | null = null;
    if (resultsVisible) {
      const countRow = await db
        .prepare("SELECT COUNT(*) as count FROM vote_record WHERE voteId = ?")
        .bind(row.id)
        .first<{ count: number }>();
      totalVotes = countRow?.count ?? 0;
    }

    results.push({
      id: row.id,
      title: row.title,
      description: row.description,
      endAt: row.endAt,
      isClosed,
      createdAt: row.createdAt,
      totalVotes,
    });
  }

  return results;
}

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
      // 结果不可见时返回 null
      voteCount: resultsVisible ? (countRow?.count ?? 0) : null,
    });
  }

  // 查询当前用户已投的选项
  let myVote: string[] | null = null;
  if (_user) {
    const myRecords = await db
      .prepare("SELECT optionId FROM vote_record WHERE voteId = ? AND userId = ?")
      .bind(id, _user.id)
      .all<{ optionId: string }>();
    if (myRecords.results.length > 0) {
      myVote = myRecords.results.map((r) => r.optionId);
    }
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
    myVote,
  };
}

/**
 * 投票（支持单选 / 多选）
 *
 * 检查已投（UNIQUE voteId+userId+optionId）和截止时间。
 * 多选时 isMultiple 必须为 1，且 optionIds 长度 ≥ 2。
 *
 * @returns false 表示已投过、已截止或参数不合法
 */
export async function castVote(
  db: D1Database,
  voteId: string,
  optionIds: string[],
  userId: string
): Promise<boolean> {
  if (!optionIds.length) return false;

  // 检查投票是否存在及截止状态
  const vote = await db
    .prepare("SELECT endAt, isClosed, isMultiple FROM vote WHERE id = ?")
    .bind(voteId)
    .first<{ endAt: string; isClosed: number; isMultiple: number }>();

  if (!vote) return false;
  if (vote.isClosed) return false;
  if (new Date(vote.endAt) <= new Date()) return false;

  // 单选模式只允许投一个选项
  if (!vote.isMultiple && optionIds.length > 1) return false;

  // 检查是否已投（任一选项）
  for (const optId of optionIds) {
    const existing = await db
      .prepare("SELECT id FROM vote_record WHERE voteId = ? AND userId = ? AND optionId = ?")
      .bind(voteId, userId, optId)
      .first();
    if (existing) return false;
  }

  // 写入投票记录
  const now = nowISO();
  for (const optId of optionIds) {
    await db
      .prepare(
        "INSERT INTO vote_record (id, voteId, optionId, userId, createdAt) VALUES (?, ?, ?, ?, ?)"
      )
      .bind(generateUUID(), voteId, optId, userId, now)
      .run();
  }

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
