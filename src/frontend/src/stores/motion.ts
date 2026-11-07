/**
 * 减少动态效果（动效总开关）
 *
 * 两个来源：
 *   - 系统设置 prefers-reduced-motion —— 由 CSS 媒体查询兜着，这里不用管；
 *   - 站内开关（这个 store）—— 存 localStorage，给"没在系统里设、但就想安静点"的人。
 *
 * 值三态：
 *   null     = 跟随系统（默认，什么都不写）
 *   reduced  = 强制关掉（html[data-motion="reduced"]）
 *   full     = 强制开着（无视系统设置，html[data-motion="full"]）
 *
 * 为什么不用 store 里放 boolean：boolean 表达不了"跟随系统"和"明确要开"的区别，
 * 而这两者行为相反 —— 前者在系统开减少动态时要关，后者要开。
 */

import { defineStore } from "pinia";

export type MotionPreference = "system" | "reduced" | "full";

/** 存储键（index.html 的免闪烁脚本读同一个键，改这里要一起改） */
export const MOTION_KEY = "rippling.motion.v1";

function readPreference(): MotionPreference {
  try {
    const raw = localStorage.getItem(MOTION_KEY);
    return raw === "reduced" || raw === "full" ? raw : "system";
  } catch {
    return "system";
  }
}

/** 把偏好写到 <html data-motion> 上（system 时清掉属性） */
function applyAttribute(preference: MotionPreference): void {
  const root = document.documentElement;
  if (preference === "system") root.removeAttribute("data-motion");
  else root.setAttribute("data-motion", preference);
}

export const useMotionStore = defineStore("motion", {
  state: () => ({
    preference: "system" as MotionPreference,
  }),

  getters: {
    /** 现在是不是"关动画"状态（系统设置也算） */
    reduced: (state) => {
      if (state.preference === "reduced") return true;
      if (state.preference === "full") return false;
      try {
        return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      } catch {
        return false;
      }
    },
  },

  actions: {
    /** 启动时读一次（main.ts 在 mount 之前调） */
    init(): void {
      this.preference = readPreference();
      applyAttribute(this.preference);
    },

    setPreference(preference: MotionPreference): void {
      this.preference = preference;
      applyAttribute(preference);
      try {
        if (preference === "system") localStorage.removeItem(MOTION_KEY);
        else localStorage.setItem(MOTION_KEY, preference);
      } catch {
        // 存不了就只对本次会话生效，不打断用户
      }
    },

    /** 设置页那个开关：开 = 减少动画，关 = 跟随系统 */
    toggleReduced(on: boolean): void {
      this.setPreference(on ? "reduced" : "system");
    },
  },
});
