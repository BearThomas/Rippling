/**
 * 首页第一页的本地快照
 *
 * 为什么单独一个模块：**这个缓存必须跟"谁登录着"绑在一起**。
 *
 * 以前它只存内容和时间戳，不分用户。一台手机换个人登录（家里电脑、教室一体机），
 * 新用户会先看到上一个人刷出来的那页帖子 —— 有了登录墙以后这不只是体验问题，
 * 是"把 A 看的东西给 B 看"。所以快照里记 userId，对不上直接作废。
 *
 * 登出时也要清（`clearFeedCache()`），由 auth store 调。
 */

import type { PinnedItemInfo, RecommendItem } from "../types";

const FEED_CACHE_KEY = "rippling.feed.v1";
/** 快照最多用 5 分钟：太旧就别假装是最新的 */
const FEED_CACHE_MAX_AGE_MS = 5 * 60 * 1000;

export interface FeedSnapshot {
  savedAt: number;
  /** 这份快照属于谁（游客为 null）；跟当前用户不一致就扔掉 */
  userId: string | null;
  pinned: PinnedItemInfo[];
  items: RecommendItem[];
  nextCursor: { lastScore: number; lastId: string } | null;
}

/**
 * 读快照
 *
 * 过期 / 损坏 / **不是这个人的** 一律返回 null，并且顺手把脏数据删掉，
 * 免得每次进首页都白读一遍。
 */
export function readFeedSnapshot(userId: string | null): FeedSnapshot | null {
  try {
    const raw = localStorage.getItem(FEED_CACHE_KEY);
    if (!raw) return null;
    const snap = JSON.parse(raw) as FeedSnapshot;
    const expired = !Array.isArray(snap?.items) || Date.now() - snap.savedAt > FEED_CACHE_MAX_AGE_MS;
    const wrongOwner = (snap?.userId ?? null) !== (userId ?? null);
    if (expired || wrongOwner) {
      localStorage.removeItem(FEED_CACHE_KEY);
      return null;
    }
    return snap;
  } catch {
    return null;
  }
}

/** 写快照（配额满 / 隐私模式写不进去就跳过） */
export function writeFeedSnapshot(
  userId: string | null,
  data: Omit<FeedSnapshot, "savedAt" | "userId">
): void {
  try {
    const snap: FeedSnapshot = { savedAt: Date.now(), userId: userId ?? null, ...data };
    localStorage.setItem(FEED_CACHE_KEY, JSON.stringify(snap));
  } catch {
    // 忽略
  }
}

/** 清掉快照（登出 / 换账号时调） */
export function clearFeedCache(): void {
  try {
    localStorage.removeItem(FEED_CACHE_KEY);
  } catch {
    // 忽略
  }
}
