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
