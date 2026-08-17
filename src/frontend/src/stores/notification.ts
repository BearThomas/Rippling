/**
 * 通知状态管理
 *
 * 服务器只存未读通知；登录后轮询未读数驱动红点，
 * 进入通知页时拉取列表，删除即已读。
 */

import { defineStore } from "pinia";
import {
  getUnreadCount,
  listNotifications,
  deleteNotification,
} from "../api/notification";
import { useAuthStore } from "./auth";
import type { NotificationInfo } from "../types";

/** 未读数轮询间隔（毫秒） */
const POLL_INTERVAL = 60_000;

export const useNotificationStore = defineStore("notification", {
  state: () => ({
    /** 未读数量（红点） */
    unreadCount: 0,
    /** 未读通知列表 */
    notifications: [] as NotificationInfo[],
    /** 轮询定时器 */
    _timer: null as number | null,
  }),

  getters: {
    hasUnread: (state) => state.unreadCount > 0,
  },

  actions: {
    /** 刷新未读数（未登录时静默跳过） */
    async refreshUnread(): Promise<void> {
      const auth = useAuthStore();
      if (!auth.isLoggedIn) {
        this.unreadCount = 0;
        return;
      }
      try {
        const { count } = await getUnreadCount();
        this.unreadCount = count;
      } catch {
        // 静默失败，等待下次轮询
      }
    },

    /** 拉取未读通知列表 */
    async loadNotifications(): Promise<void> {
      this.notifications = await listNotifications();
      this.unreadCount = this.notifications.length;
    },

    /** 删除单条通知（已读） */
    async markRead(id: string): Promise<void> {
      await deleteNotification(id);
      this.notifications = this.notifications.filter((n) => n.id !== id);
      this.unreadCount = this.notifications.length;
    },

    /** 清空全部通知（全部已读） */
    async markAllRead(): Promise<void> {
      await deleteNotification();
      this.notifications = [];
      this.unreadCount = 0;
    },

    /** 启动未读数轮询（登录后可用） */
    startPolling(): void {
      if (this._timer !== null) return;
      this.refreshUnread();
      this._timer = window.setInterval(() => this.refreshUnread(), POLL_INTERVAL);
    },

    /** 停止轮询（登出 / 卸载时调用） */
    stopPolling(): void {
      if (this._timer !== null) {
        window.clearInterval(this._timer);
        this._timer = null;
      }
    },
  },
});
