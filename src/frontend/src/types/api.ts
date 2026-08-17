/**
 * API 类型定义
 *
 * 与后端统一响应格式及数据库实体对齐（字段命名与 D1 Schema 一致）。
 * 时间戳均为 ISO 8601 字符串；布尔字段后端返回 0/1 或 boolean，
 * 前端类型按后端路由层序列化结果标注。
 */

// ============================================================
//  统一响应格式
// ============================================================

/** 成功响应 */
export interface ApiSuccess<T> {
  success: true;
  data: T;
}

/** 失败响应 */
export interface ApiError {
  success: false;
  error: {
    code: string;
    message: string;
  };
}

/** 统一响应 */
export type ApiResponse<T> = ApiSuccess<T> | ApiError;

// ============================================================
//  用户
// ============================================================

/** Better Auth 会话用户（/api/auth/get-session 返回） */
export interface SessionUser {
  id: string;
  name: string | null;
  email: string | null;
  image: string | null;
}

/** Better Auth 会话 */
export interface SessionInfo {
  user: SessionUser;
  session: {
    id: string;
    userId: string;
    expiresAt: string;
    token: string;
  } | null;
}

/** 用户资料（user_profile） */
export interface UserProfile {
  id: string;
  userId: string;
  studentId: string | null;
  username: string;
  /** 权限位掩码，后端以十进制字符串返回 */
  permissions: string;
  nameColor: string | null;
  badge: string | null;
  questionBoxEnabled: boolean;
  violationCount: number;
  isDeactivated: boolean;
  createdAt: string;
  updatedAt: string;
}

/** 管理面板用户信息 */
export interface AdminUserInfo extends UserProfile {}

// ============================================================
//  帖子 / 评论
// ============================================================

/** 帖子作者摘要 */
export interface PostAuthor {
  id: string;
  username: string;
  nameColor: string | null;
  badge: string | null;
}

/** 帖子（含评论，post 表 parentId 区分） */
export interface PostInfo {
  id: string;
  parentId: string | null;
  /** 匿名时对当前用户为 null */
  authorId: string | null;
  title: string | null;
  content: string;
  visibility: "public" | "private" | "specified";
  blockId: string | null;
  isPinned: boolean;
  isArchived: boolean;
  createdAt: string;
  updatedAt: string;
  /** 路由层附加：作者信息（匿名时为 null） */
  author?: PostAuthor | null;
  /** 路由层附加：点赞数 */
  likeCount?: number;
  /** 路由层附加：评论数（顶级帖） */
  commentCount?: number;
  /** 路由层附加：当前用户是否已点赞 */
  liked?: boolean;
}

// ============================================================
//  推荐流 / 置顶
// ============================================================

/** 推荐流中的帖子数据 */
export interface RecommendPostData {
  id: string;
  title: string | null;
  content: string;
  authorId: string;
  author: PostAuthor | null;
  authorVisible: boolean;
  isPinned: boolean;
  likeCount: number;
  commentCount: number;
  /** 当前用户是否关注了作者 */
  followed: boolean;
  createdAt: string;
}

/** 推荐流中的表白墙数据 */
export interface RecommendConfessionData {
  id: string;
  content: string;
  likeCount: number;
  createdAt: string;
}

/** 推荐流中的大事记数据 */
export interface RecommendTimelineData {
  id: string;
  title: string;
  description: string;
  eventDate: string;
  likeCount: number;
  createdAt: string;
}

/** 推荐流中的投票数据 */
export interface RecommendVoteData {
  id: string;
  title: string;
  description: string | null;
  endAt: string;
  isClosed: boolean;
  likeCount: number;
  createdAt: string;
}

/** 推荐流内容项 */
export type RecommendItem =
  | { type: "post"; id: string; score: number; data: RecommendPostData }
  | { type: "confession"; id: string; score: number; data: RecommendConfessionData }
  | { type: "timeline"; id: string; score: number; data: RecommendTimelineData }
  | { type: "vote"; id: string; score: number; data: RecommendVoteData };

/** 推荐流置顶项 */
export interface PinnedItemInfo {
  id: string;
  targetType: "post" | "timeline" | "vote";
  targetId: string;
  createdBy: string;
  expiresAt: string | null;
  createdAt: string;
  /** 关联内容数据（结构与推荐流对应类型的 data 一致） */
  data: Record<string, unknown> | null;
}

/** 推荐流响应（第一页含 pinned，后续页 pinned 为空数组） */
export interface RecommendFeed {
  pinned: PinnedItemInfo[];
  items: RecommendItem[];
  /** 下一页游标（null 表示没有更多） */
  nextCursor: { lastScore: number; lastId: string } | null;
}

// ============================================================
//  搜索
// ============================================================

/** 搜索类型 */
export type SearchType = "all" | "post" | "user" | "block" | "timeline" | "confession" | "comment";

/** 搜索结果中的帖子 / 评论 */
export interface SearchPostResult {
  id: string;
  parentId: string | null;
  authorId: string | null;
  title: string | null;
  content: string;
  blockId: string | null;
  createdAt: string;
}

/** 搜索结果中的用户（不含学号） */
export interface SearchUserResult {
  userId: string;
  username: string;
  nameColor: string | null;
  badge: string | null;
}

/** 搜索结果中的板块 */
export interface SearchBlockResult {
  id: string;
  name: string;
  description: string | null;
  ownerId: string;
  isLocked: boolean;
  createdAt: string;
}

/** 搜索结果中的大事记 */
export interface SearchTimelineResult {
  id: string;
  title: string;
  description: string;
  eventDate: string;
  createdAt: string;
}

/** 搜索结果中的表白墙 */
export interface SearchConfessionResult {
  id: string;
  content: string;
  createdAt: string;
}

/** 聚合搜索结果（按 type 过滤时只有对应字段） */
export interface SearchAllResult {
  posts?: SearchPostResult[];
  comments?: SearchPostResult[];
  users?: SearchUserResult[];
  blocks?: SearchBlockResult[];
  timeline?: SearchTimelineResult[];
  confessions?: SearchConfessionResult[];
}

/** 搜索响应 */
export interface SearchData {
  q: string;
  type: SearchType;
  results: SearchAllResult;
  total: number;
}

// ============================================================
//  表白墙 / 大事记 / 投票
// ============================================================

/** 表白墙 */
export interface ConfessionInfo {
  id: string;
  authorId: string;
  content: string;
  isDeleted: boolean;
  isArchived: boolean;
  createdAt: string;
  updatedAt: string;
  likeCount?: number;
}

/** 大事记 */
export interface TimelineEvent {
  id: string;
  title: string;
  description: string;
  eventDate: string;
  status: "pending" | "approved" | "rejected";
  submittedBy: string;
  reviewedBy: string | null;
  reviewedAt: string | null;
  createdAt: string;
}

/** 投票选项 */
export interface VoteOption {
  id: string;
  voteId: string;
  content: string;
  /** 路由层附加：票数 */
  count?: number;
  /** 路由层附加：当前用户是否投了该选项 */
  selected?: boolean;
}

/** 投票 */
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
  options?: VoteOption[];
  totalVotes?: number;
}

// ============================================================
//  板块
// ============================================================

/** 板块 */
export interface BlockInfo {
  id: string;
  name: string;
  description: string | null;
  ownerId: string;
  isLocked: boolean;
  isDeleted: boolean;
  isArchived: boolean;
  createdAt: string;
  /** 路由层附加：成员数 */
  memberCount?: number;
}

// ============================================================
//  工单
// ============================================================

/** 工单类型 */
export type TicketType =
  | "permission_request"
  | "report"
  | "appeal"
  | "verification"
  | "block_create"
  | "account_deletion"
  | "timeline_submit";

/** 工单 */
export interface TicketInfo {
  id: string;
  type: TicketType;
  title: string;
  content: string | null;
  status: "open" | "closed";
  submittedBy: string;
  assignedTo: string | null;
  result: string | null;
  targetType: string | null;
  targetId: string | null;
  extraData: string | null;
  createdAt: string;
  updatedAt: string;
}

// ============================================================
//  通知
// ============================================================

/** 通知（服务器只存未读） */
export interface NotificationInfo {
  id: string;
  userId: string;
  type: string;
  targetType: string | null;
  targetId: string | null;
  content: string;
  createdAt: string;
}

// ============================================================
//  关注 / 提问箱
// ============================================================

/** 关注状态 */
export interface FollowStatus {
  following: boolean;
  followedBy: boolean;
}

/** 提问箱设置 */
export interface QuestionBoxInfo {
  enabled: boolean;
  onlyFollowers: boolean;
}

/** 提问 */
export interface QuestionInfo {
  id: string;
  boxId: string;
  askerId: string;
  content: string;
  answer: string | null;
  answered: boolean;
  isDeleted: boolean;
  createdAt: string;
  answeredAt: string | null;
}

// ============================================================
//  管理日志
// ============================================================

/** 管理日志（完全公开） */
export interface AdminLogInfo {
  id: string;
  adminId: string;
  adminUsername: string | null;
  action: string;
  targetType: string;
  targetId: string;
  detail: string | null;
  createdAt: string;
}

// ============================================================
//  站点配置
// ============================================================

/** 主题配置（与 config/site.config.json 的 theme 字段一致） */
export interface SiteConfigTheme {
  preset: "light" | "dark" | "campus" | "warm";
  primaryColor: string;
  backgroundColor: string;
  textColor: string;
  accentColor: string;
}

/** 推荐权重 */
export interface SiteConfigRecommendWeights {
  like: number;
  comment: number;
  follow: number;
  block: number;
  time: number;
  random: number;
}

/** 站点配置（/api/config 返回） */
export interface SiteConfig {
  siteName: string;
  authMethod: string;
  studentIdPattern: string;
  studentIdHint: string;
  defaultPermissions: number;
  archiveDays: number;
  theme: SiteConfigTheme;
  recommendWeights: SiteConfigRecommendWeights;
}

