/**
 * 认证状态管理
 *
 * 会话来自 Better Auth（Cookie），应用启动时 fetchSession 拉取一次；
 * 登录 / 注册成功后调用 fetchSession 刷新。
 */

import { defineStore } from "pinia";
import { signOut as apiSignOut } from "../api/auth";
import { getBootstrap, getBootstrapSnapshot, refreshBootstrap } from "../api/bootstrap";
import { clearPermissionCache, primePermissions } from "../utils/myPermissions";
import type { SessionInfo } from "../types";

export const useAuthStore = defineStore("auth", {
  state: () => ({
    /** 当前会话（游客为 null） */
    session: null as SessionInfo | null,
    /** 是否已完成首次会话拉取 */
    loaded: false,
  }),

  getters: {
    /** 是否已登录 */
    isLoggedIn: (state) => Boolean(state.session?.user?.id),
    /** 当前用户 ID */
    userId: (state) => state.session?.user?.id ?? null,
    /** 当前用户名 */
    username: (state) => state.session?.user?.name ?? null,
  },

  actions: {
    /** 用 BootstrapData 里的会话应用登录态（首屏快照 / 拉取结果都走这里） */
    applyBootstrap(data: { session: SessionInfo | null; permissions: string }): void {
      this.session = data.session;
      this.loaded = true;
      primePermissions(data.permissions);
    },

    /**
     * 拉取当前会话（游客返回 null，不弹错误）
     *
     * 走 /api/bootstrap：一次请求同时拿到会话 + 权限，慢网络下少两个往返。
     * 先用 localStorage 快照把登录态画出来，再用真实结果覆盖。
     */
    async fetchSession(): Promise<void> {
      const snapshot = getBootstrapSnapshot();
      if (snapshot) this.applyBootstrap(snapshot);

      try {
        this.applyBootstrap(await getBootstrap(true));
      } catch {
        this.loaded = true;
      }
    },

    /**
     * 本地更新会话中的用户名（修改成功后立即生效）
     *
     * 避免依赖重新拉取会话（get-session 可能命中缓存 / 延迟），
     * 后端已在修改时同步更新 user.name，此处作为即时反馈兜底。
     */
    setUsername(name: string): void {
      if (this.session?.user) {
        this.session.user.name = name;
      }
    },

    /** 登出并清空本地会话（顺带清掉权限缓存与 bootstrap 快照里的登录态） */
    async signOut(): Promise<void> {
      try {
        await apiSignOut();
      } finally {
        this.session = null;
        clearPermissionCache();
        // 让下次请求拿到"游客"的 bootstrap（失败也不影响本地已清空）
        void refreshBootstrap().catch(() => undefined);
      }
    },
  },
});
