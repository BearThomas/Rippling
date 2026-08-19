/**
 * 认证状态管理
 *
 * 会话来自 Better Auth（Cookie），应用启动时 fetchSession 拉取一次；
 * 登录 / 注册成功后调用 fetchSession 刷新。
 */

import { defineStore } from "pinia";
import { getSession, signOut as apiSignOut } from "../api/auth";
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
    /** 拉取当前会话（游客返回 null，不弹错误） */
    async fetchSession(): Promise<void> {
      this.session = await getSession();
      this.loaded = true;
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

    /** 登出并清空本地会话 */
    async signOut(): Promise<void> {
      try {
        await apiSignOut();
      } finally {
        this.session = null;
      }
    },
  },
});
