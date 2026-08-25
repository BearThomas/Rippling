/**
 * 主题状态管理
 *
 * 从 /api/config 读取站点配置中的主题字段：
 *   1. 按 preset（light/dark/campus/warm）设置 data-theme 属性，
 *      由 styles/theme.css 的预设变量兜底；
 *   2. 再用配置中的具体颜色覆写 :root CSS 变量；
 *   3. 管理面板自定义 CSS（后续任务）通过 applyCustomCss 注入。
 */

import { defineStore } from "pinia";
import { getSiteConfig } from "../api/config";
import type { SiteConfig } from "../types";

/** 自定义 CSS 注入的 style 标签 ID */
const CUSTOM_STYLE_ID = "rippling-custom-css";

export const useThemeStore = defineStore("theme", {
  state: () => ({
    /** 站点配置（加载失败为 null，使用 CSS 默认主题） */
    config: null as SiteConfig | null,
    /** 是否已完成首次加载 */
    loaded: false,
  }),

  getters: {
    /** 站点名称 */
    siteName: (state) => state.config?.siteName ?? "Rippling",
    /** 站点图标 URL（未设置时为空串） */
    siteIcon: (state) => state.config?.siteIcon ?? "",
    /** 当前主题预设 */
    preset: (state) => state.config?.theme?.preset ?? "light",
  },

  actions: {
    /** 加载站点配置并应用主题（失败时静默回退默认主题） */
    async loadConfig(): Promise<void> {
      try {
        this.config = await getSiteConfig();
      } catch {
        this.config = null;
      }
      this.applyTheme();
      this.applySiteIdentity();
      this.loaded = true;
    },

    /**
     * 应用站点身份：浏览器标签页标题 + favicon
     *
     * 站点名称来自 /api/config 的 siteName（标题统一以 siteName 结尾）；
     * siteIcon 存在时动态更新 link[rel="icon"]，为空保留默认 favicon。
     */
    applySiteIdentity(): void {
      const name = this.siteName;

      // 1. 标签页标题（无后缀，路由 afterEach 会拼接页面标题）
      document.title = name;

      // 2. favicon
      const icon = this.siteIcon;
      let link = document.querySelector<HTMLLinkElement>("link[rel='icon']");
      if (icon) {
        if (!link) {
          link = document.createElement("link");
          link.rel = "icon";
          document.head.appendChild(link);
        }
        if (link.href !== icon) {
          link.href = icon;
        }
      }
      // siteIcon 为空：保留 index.html 中的默认 favicon，不做任何修改

      // 3. iOS 添加到主屏幕的标题
      const meta = document.querySelector('meta[name="apple-mobile-web-app-title"]');
      if (meta) meta.setAttribute("content", name);
    },

    /** 将主题配置应用到根元素 CSS 变量 */
    applyTheme(): void {
      const root = document.documentElement;
      const theme = this.config?.theme;

      // 1. 预设主题（data-theme 触发 theme.css 中的变量组）
      root.setAttribute("data-theme", theme?.preset ?? "light");

      // 2. 具体颜色覆写（优先于预设）
      if (theme) {
        if (theme.primaryColor) root.style.setProperty("--c-primary", theme.primaryColor);
        if (theme.backgroundColor) root.style.setProperty("--c-bg", theme.backgroundColor);
        if (theme.textColor) root.style.setProperty("--c-text", theme.textColor);
        if (theme.accentColor) root.style.setProperty("--c-accent", theme.accentColor);
      }

      // 3. 同步浏览器地址栏主题色
      const meta = document.querySelector('meta[name="theme-color"]');
      if (meta && theme?.primaryColor) {
        meta.setAttribute("content", theme.primaryColor);
      }
    },

    /**
     * 注入管理面板自定义 CSS（仅超管在后台配置后生效）
     * 传 null / 空串时移除已注入的样式。
     */
    applyCustomCss(css: string | null | undefined): void {
      const existing = document.getElementById(CUSTOM_STYLE_ID);
      if (!css) {
        existing?.remove();
        return;
      }
      const style = existing ?? document.createElement("style");
      style.id = CUSTOM_STYLE_ID;
      style.textContent = css;
      if (!existing) document.head.appendChild(style);
    },
  },
});
