/**
 * 路由模块 — 统一导出
 *
 * 所有业务路由模块的单一入口，供 api/[[route]].ts 挂载。
 */

export { default as postRoutes } from "./post";
export { default as likeRoutes } from "./likes";
export { default as confessionRoutes } from "./confession";
export { default as timelineRoutes } from "./timeline";
export { default as voteRoutes } from "./vote";
export { default as recommendRoutes } from "./recommend";
export { default as searchRoutes } from "./search";
export { default as followRoutes } from "./follow";
export { default as questionRoutes } from "./question";
export { default as notificationRoutes } from "./notification";
export { default as blockRoutes } from "./block";
export { default as ticketRoutes } from "./ticket";
export { default as adminRoutes } from "./admin";
export { default as adminLogRoutes } from "./adminLog";
export { default as permissionRoutes } from "./permission";
export { default as uploadRoutes } from "./upload";
export { default as imageRoutes } from "./image";
export { default as userRoutes } from "./user";
export { default as setupRoutes } from "./setup";
