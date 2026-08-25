/**
 * 设备识别中间件（占位）
 *
 * 职责：
 *   1. 从请求 Header 中读取 X-Device-ID
 *   2. 将 deviceId 挂载到 context 上
 *
 * 当前状态：占位实现，仅读取 Header 值
 *
 * TODO: Task 4 会验证设备绑定关系（检查设备是否在 user_device 表中注册、
 *       是否为被封禁设备等）。
 */

import { createMiddleware } from "hono/factory";
import type { AppContextVars } from "./auth";

/** 请求 Header 中设备 ID 的字段名 */
const DEVICE_HEADER = "X-Device-ID";

/**
 * 设备识别中间件
 *
 * 读取 X-Device-ID Header 并挂载到 context.deviceId。
 */
export const deviceMiddleware = createMiddleware<{
  Variables: AppContextVars;
}>(async (c, next) => {
  const deviceId = c.req.header(DEVICE_HEADER) ?? null;

  // TODO: Task 4 — 验证设备绑定关系
  // if (user && deviceId) {
  //   const device = await DB.query.user_device.findFirst({
  //     where: and(eq(user_device.userId, user.id), eq(user_device.deviceId, deviceId))
  //   });
  //   if (!device) { /* 拒绝或要求重新绑定 */ }
  //   if (device.isBlocked) { /* 拒绝访问 */ }
  // }

  c.set("deviceId", deviceId);

  await next();
});
