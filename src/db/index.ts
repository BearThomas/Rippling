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
  updateUsername,
  updatePermissions,
} from "./user";

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
} from "./timeline";

// 投票
export {
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
} from "./question";

// 工单
export {
  createTicket,
  listTickets,
  getTicketById,
  updateTicketStatus,
} from "./ticket";

// 板块
export {
  createBlock,
  getBlockById,
  listBlocks,
  joinRequest,
  approveJoin,
  updateMemberPermissions,
  lockBlock,
  deleteBlock,
} from "./block";
