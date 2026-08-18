/**
 * 数据访问层 — 统一导出
 *
 * 所有数据库查询函数的单一入口。
 * 路由层只需 import from "@/db" 即可访问全部 DAL 函数。
 */

// 帖子 / 评论
export {
  getPostById,
  listPostsByParent,
  listUserPosts,
  listUserComments,
  listBlockPosts,
  createPost,
  createPostWithVisibility,
  updatePostContent,
  softDeletePost,
  pinPost,
} from "./post";

// 用户资料
export {
  getUserProfileById,
  getUserProfileByUsername,
  getUserPublicProfile,
  userExists,
  updateUsername,
  countRecentUsernameChanges,
  updateAvatar,
  updatePermissions,
  deactivateUser,
  reactivateUser,
  incrementViolationCount,
  resetViolationCount,
  getUserViolationCount,
  setUserPermissionsDirect,
  getUserPermissions,
  updateUserNameColor,
  getAdminUserInfo,
  listUsersForAdmin,
  setUserPermissions,
  banUser,
  unbanUser,
  resetUserViolations,
} from "./user";
export type { AdminUserInfo, UserPublicProfile } from "./user";

// 管理日志
export { writeAdminLog, listAdminLogs } from "./adminLog";
export type { WriteAdminLogData, AdminLogInfo, AdminLogFilters } from "./adminLog";

// 站点配置
export { getSiteConfig, updateSiteConfig } from "./siteConfig";
export type {
  SiteConfig,
  SiteConfigTheme,
  SiteConfigRecommendWeights,
  SiteConfigNameColors,
} from "./siteConfig";

// 归档查看器
export { listArchiveFiles, getArchiveFileContent } from "./archiveViewer";
export type { ArchiveFileInfo } from "./archiveViewer";

// 帖子 / 评论展示信息附加
export {
  enrichPosts,
  enrichPost,
  getPostAuthorBrief,
  getTargetLikeCount,
  getChildCommentCount,
} from "./enrichment";
export type { EnrichedPost, PostAuthorBrief } from "./enrichment";

// 点赞
export { toggleLike, getLikeCount, getUserLiked } from "./likes";

// 表白墙
export {
  getConfessionById,
  listConfessions,
  createConfession,
  softDeleteConfession,
} from "./confession";

// 大事记
export {
  listTimelineEvents,
  getTimelineEventById,
  submitTimeline,
  reviewTimeline,
  listUserTimelines,
  getTimelineReviewInfo,
  createTimelineComment,
  createTimelineFromTicket,
} from "./timeline";

// 投票
export {
  listVotes,
  createVote,
  getVoteById,
  castVote,
  closeVote,
} from "./vote";

// 关注
export {
  followUser,
  unfollowUser,
  isFollowing,
  listFollowers,
  listFollowing,
} from "./follow";

// 提问箱
export {
  getQuestionBox,
  setQuestionBoxEnabled,
  createQuestion,
  answerQuestion,
  listQuestions,
  softDeleteQuestion,
} from "./question";

// 工单
export {
  createTicket,
  listTickets,
  listTicketsByType,
  getMyTickets,
  getRecentTickets,
  getTicketById,
  updateTicketStatus,
} from "./ticket";
export type { TicketInfo } from "./ticket";

// 板块
export {
  createBlock,
  getBlockById,
  listBlocks,
  joinRequest,
  approveJoin,
  updateMemberPermissions,
  lockBlock,
  unlockBlock,
  deleteBlock,
  listBlockMembers,
  removeBlockMember,
  addToBlockBlacklist,
  removeFromBlockBlacklist,
  listBlockBlacklist,
  listMyBlocks,
  listMyPendingJoinRequests,
  transferBlockOwnership,
  leaveBlock,
  getBlockJoinRequests,
  rejectJoinRequest,
  BLOCK_OWNER_PERMISSIONS,
  BLOCK_DEFAULT_MEMBER_PERMISSIONS,
} from "./block";
export type { BlockBlacklistInfo } from "./block";

// 推荐流
export { listRecommendations } from "./recommend";

// 置顶
export { pinItem, unpinItem, listActivePinned } from "./pinned";

// 搜索
export {
  searchPosts,
  searchComments,
  searchUsers,
  searchBlocks,
  searchTimeline,
  searchConfessions,
  searchAll,
} from "./search";

// 通知
export {
  createNotification,
  listUserNotifications,
  getUnreadCount,
  deleteNotification,
} from "./notification";
