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

/** 管理面板用户信息（GET /api/admin/users、/user 的路由层序列化视图） */
export interface AdminUserInfo {
  id: string;
  username: string;
  studentId: string | null;
  /** 权限位掩码，后端以十进制字符串返回（BigInt 序列化） */
  permissions: string;
  nameColor: string | null;
  badge: string | null;
  violationCount: number;
  /** 账号是否已注销 */
  isDeactivated: boolean;
  createdAt: string;
}

/** 用户公开资料（GET /api/user/profile，含头像与关注关系） */
export interface UserPublicProfile {
  userId: string;
  username: string;
  nameColor: string | null;
  /** 名字牌子（认证 / 头衔标识） */
  badge: string | null;
  /** 头像 URL（无头像为 null） */
  avatar: string | null;
  questionBoxEnabled: boolean;
  /** 关注数（TA 关注了多少人） */
  followingCount: number;
  /** 粉丝数（多少人关注了 TA） */
  followerCount: number;
  /** 当前用户是否关注了 TA（游客 / 看自己为 false） */
  isFollowedByMe: boolean;
  createdAt: string;
}

/** 用户帖子列表响应（GET /api/user/posts） */
export interface UserPostsData {
  posts: PostInfo[];
  total: number;
}

/** 用户评论列表响应（GET /api/user/comments） */
export interface UserCommentsData {
  comments: PostInfo[];
  total: number;
}

// ============================================================
//  帖子 / 评论
// ============================================================

/** 帖子作者摘要 */
export interface PostAuthor {
  id: string;
  username: string;
  nameColor: string | null;
  badge: string | null;
  /** 头像 URL（无头像为 null） */
  avatar: string | null;
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
  /** 头像 URL（无头像为 null） */
  avatar: string | null;
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
  content: string;
  createdAt: string;
  updatedAt: string;
  likeCount: number;
}

/** 表白墙列表项（preview 为 100 字截断预览；作者永远匿名） */
export interface ConfessionListItem {
  id: string;
  preview: string;
  createdAt: string;
  likeCount: number;
}

/** 大事记（列表返回描述预览，详情返回完整描述） */
export interface TimelineEvent {
  id: string;
  title: string;
  description: string;
  eventDate: string;
  /** 提交人用户名（账号注销等场景为 null） */
  submittedBy: string | null;
  createdAt: string;
  likeCount: number;
  /** 审核信息（仅提交者本人或 review_timeline 权限者可见） */
  reviewedBy?: string | null;
  reviewedAt?: string | null;
}

/** 我提交的大事记（timeline_submit 工单映射，/api/timeline/my） */
export interface TimelineSubmission {
  /** 工单 ID */
  id: string;
  title: string;
  status: "pending" | "approved" | "rejected";
  eventDate: string;
  createdAt: string;
  result: string | null;
}

/** 投票选项（结果不可见时 voteCount 为 null） */
export interface VoteOption {
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
  /** 创建者 userId */
  createdBy: string;
  isClosed: boolean;
  createdAt: string;
  options: VoteOption[];
  /** 结果是否可见（实时可见 / 已关闭 / 已截止） */
  resultsVisible: boolean;
  /** 当前用户已投的选项 ID 列表（未投 / 未登录为 null） */
  myVote: string[] | null;
}

/** 投票列表项 */
export interface VoteListItem {
  id: string;
  title: string;
  description: string | null;
  endAt: string;
  isClosed: boolean;
  createdAt: string;
  /** 总票数（结果不可见时为 null） */
  totalVotes: number | null;
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
  createdAt: string;
  /** 路由层附加：成员数（后端暂未提供） */
  memberCount?: number;
}

/** 板块详情（含当前用户的成员信息） */
export interface BlockDetailInfo extends BlockInfo {
  /** 当前用户是否为成员 */
  isMember: boolean;
  /** 当前用户角色（owner / member；非成员为 null） */
  myRole: string | null;
  /** 当前用户板块权限掩码（十进制字符串；非成员为 null） */
  myPermissions: string | null;
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
  /** 后端当前仅产生 open / closed；processing 预留兼容 */
  status: "open" | "processing" | "closed";
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

/** 通知（服务器只存未读；不返回 userId） */
export interface NotificationInfo {
  id: string;
  /** comment / follow / system */
  type: string;
  targetType: string | null;
  targetId: string | null;
  content: string;
  createdAt: string;
}

// ============================================================
//  关注 / 提问箱
// ============================================================

/** 关注状态（GET /api/follow/status） */
export interface FollowStatus {
  following: boolean;
}

/** 关注 / 粉丝列表项 */
export interface FollowUserInfo {
  id: string;
  username: string;
  nameColor: string | null;
  badge: string | null;
  /** 头像 URL（无头像为 null） */
  avatar: string | null;
  /** 当前登录用户是否关注了 TA */
  isFollowedByMe: boolean;
}

/** 提问箱设置 */
export interface QuestionBoxInfo {
  enabled: boolean;
  onlyFollowers: boolean;
}

/** 提问（askerId 永不返回；未回答问题仅主人可见由后端过滤） */
export interface QuestionInfo {
  id: string;
  content: string;
  answer: string | null;
  answered: boolean;
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

/** 用户等级名称颜色 */
export interface SiteConfigNameColors {
  /** 普通用户 */
  normal: string;
  /** 活跃用户 */
  active: string;
  /** 认证用户 */
  verified: string;
  /** 管理员 */
  admin: string;
  /** 板块长 */
  owner: string;
  /** 站长/超级管理员 */
  superadmin: string;
}

/** 站点配置（/api/config 返回） */
export interface SiteConfig {
  siteName: string;
  /** 站点图标（图片 URL，可为空串表示未设置） */
  siteIcon?: string;
  authMethod: string;
  studentIdPattern: string;
  studentIdHint: string;
  defaultPermissions: number;
  archiveDays: number;
  theme: SiteConfigTheme;
  recommendWeights: SiteConfigRecommendWeights;
  /** 用户等级颜色（旧配置可能缺失） */
  nameColors: SiteConfigNameColors;
}

