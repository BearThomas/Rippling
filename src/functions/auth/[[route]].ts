/**
 * Better Auth 入口
 *
 * 当前为占位实现，后续 Task 会：
 * - 初始化 better-auth 实例并接入 Cloudflare D1
 * - 配置 student_id 认证方式
 * - 挂载注册 / 登录 / 会话管理路由
 */

// TODO: 初始化 Better Auth 实例
// import { betterAuth } from "better-auth";
// import { cloudflareD1 } from "better-auth-cloudflare";

export const onRequest = async () => {
  // 占位：后续 Task 会替换为完整的 Better Auth handler
  return new Response(
    JSON.stringify({ message: "Auth endpoint — not yet implemented" }),
    {
      headers: { "Content-Type": "application/json" },
    }
  );
};
