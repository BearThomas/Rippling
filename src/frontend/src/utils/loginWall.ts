/**
 * 登录墙的"哪些页面能进"规则
 *
 * 跟后端 src/middleware/loginWall.ts 是同一套语义，但**这里只负责跳转体验**：
 * 真正拦数据的是后端（只靠前端跳登录页是假墙，游客 curl 照样能拿数据）。
 *
 * 三档（站点配置 loginWall）：
 *   none —— 谁都能进
 *   soft —— 内容要登录，但**单条帖子详情**公开（群里转发链接点开能看）
 *   hard —— 除登录/注册/初始化外全部要登录
 */

import type { LoginWallMode } from "../types";

/** 认不出来的值一律当硬墙（宁严不松，跟后端一致） */
export function normalizeLoginWall(value: unknown): LoginWallMode {
  return value === "none" || value === "soft" || value === "hard" ? value : "hard";
}

/** 永远能进的页面：登录 / 注册 / 初始化向导 */
const ALWAYS_PUBLIC = ["/setup", "/login", "/register"];

/** 软墙额外放行的页面（只读的帖子详情；评论详情页不放） */
function softAllows(path: string): boolean {
  return path === "/post" || path.startsWith("/post/");
}

/** 当前墙档位下，这个路径游客能不能进 */
export function wallAllowsPath(mode: LoginWallMode, path: string): boolean {
  if (mode === "none") return true;
  if (ALWAYS_PUBLIC.some((p) => path === p || path.startsWith(`${p}/`))) return true;
  if (mode === "soft" && softAllows(path)) return true;
  return false;
}
