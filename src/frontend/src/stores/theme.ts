/**
 * 主题状态管理
 *
 * 两层主题，一层压一层：
 *
 *   1. **全站主题** = 管理员在后台设的 `SiteConfig.theme`（所有人默认看到的那个）；
 *   2. **本地主题** = 这个用户自己在设置页挑的，存在 localStorage（不落库、不上传）。
 *
 * 最终生效 = 本地主题 ?? 全站主题 ?? 兜底明亮。
 *
 * 这条"本地优先"的顺序就是需求本身：管理员哪天把全站换成深色，
 * 自己挑过主题的人**不该**被换掉 —— 只有"跟随全站"的人跟着变。
 * 反过来说，本地主题永远不能写进 `config.theme`（以前设置页就是直接改
 * store.config 的，改完自己看着对，但那是"改了全站配置的本地副本"，
 * 既会被下一次配置刷新冲掉，也让"谁的自定义"说不清）。
 *
 * 应用到页面上的动作序列：设 `data-theme`（触发 theme.css 的变量组兜底）
 * → 覆写四条 `--c-*` 变量 → 同步浏览器地址栏颜色。
 */

import { defineStore } from "pinia";
import { getBootstrap, getBootstrapSnapshot } from "../api/bootstrap";
import type { SiteConfig, SiteConfigTheme } from "../types";
import { coerceSiteTheme, normalizeTheme, DEFAULT_THEME, themeForPreset } from "../utils/themePresets";
import type { ThemePreset } from "../utils/themePresets";

/** 自定义 CSS 注入的 style 标签 ID */
const CUSTOM_STYLE_ID = "rippling-custom-css";

/**
 * 本地主题的存储键
 *
 * 带版本号：以后主题结构变了（比如加"圆角""字体"），
 * 老的那份读不出来就自然作废，而不是拿半份数据去渲染。
 * index.html 里的免闪烁脚本读的是同一个键，改这里要一起改。
 */
export const LOCAL_THEME_KEY = "rippling.theme.v1";

/** 读本地主题（坏了就当没有，并清掉，免得每次启动都在同一处踩一下） */
function readLocalTheme(): SiteConfigTheme | null {
  try {
    const raw = localStorage.getItem(LOCAL_THEME_KEY);
    if (!raw) return null;
    const parsed = normalizeTheme(JSON.parse(raw));
    if (!parsed) {
      console.warn("[theme] 本地主题读不出来，已丢弃:", raw.slice(0, 120));
      localStorage.removeItem(LOCAL_THEME_KEY);
    }
    return parsed;
  } catch (error) {
    console.warn("[theme] 本地主题解析失败，已丢弃:", error);
    try {
      localStorage.removeItem(LOCAL_THEME_KEY);
    } catch {
      /* 隐私模式下 localStorage 可能直接抛，忽略 */
    }
    return null;
  }
}

function writeLocalTheme(theme: SiteConfigTheme | null): void {
  try {
    if (theme) localStorage.setItem(LOCAL_THEME_KEY, JSON.stringify(theme));
    else localStorage.removeItem(LOCAL_THEME_KEY);
  } catch {
    /* 存不了就只在这次会话里生效，不要因此打断用户 */
  }
}

export const useThemeStore = defineStore("theme", {
  state: () => ({
    /** 站点配置（加载失败为 null，使用 CSS 默认主题） */
    config: null as SiteConfig | null,
    /** 是否已完成首次加载 */
    loaded: false,
    /** 用户自己挑的主题；null = 跟随全站 */
    localTheme: null as SiteConfigTheme | null,
  }),

  getters: {
    /** 站点名称 */
    siteName: (state) => state.config?.siteName ?? "Rippling",
    /** 站点图标 URL（未设置时为空串） */
    siteIcon: (state) => state.config?.siteIcon ?? "",
    /** 管理员设的全站主题 */
    siteTheme: (state): SiteConfigTheme => coerceSiteTheme(state.config?.theme),
    /** 最终生效的主题（本地优先） */
    theme(): SiteConfigTheme {
      return this.localTheme ?? this.siteTheme ?? DEFAULT_THEME;
    },
    /** 当前主题预设 */
    preset(): ThemePreset {
      return this.theme.preset;
    },
    /** 这个用户是不是自己挑过主题 */
    hasLocalTheme: (state) => state.localTheme !== null,
  },

  actions: {
    /**
     * 启动时先把本地主题画上去（不等网络）
     *
     * main.ts 在 mount 之前调用。不放在 state() 里做副作用：
     * 那是构造函数，读 localStorage 抛异常会把整个 store 建崩。
     */
    init(): void {
      this.localTheme = readLocalTheme();
      this.applyTheme();
    },

    /** 直接用 BootstrapData 里的配置应用主题（首屏快照路径） */
    applyBootstrap(data: { config: SiteConfig }): void {
      this.config = data.config;
      // 注意：只更新全站主题，本地主题原样保留 —— 这正是"管理员改主题不影响自定义用户"的地方
      this.applyTheme();
      this.applySiteIdentity();
      this.loaded = true;
    },

    /**
     * 加载站点配置并应用主题（失败时静默回退默认主题）
     *
     * @param force true 时绕过 bootstrap 缓存（管理面板保存配置后调用）
     */
    async loadConfig(force = false): Promise<void> {
      // 先用快照把主题/站名画出来（同步，不闪）
      const snapshot = getBootstrapSnapshot();
      if (snapshot) this.applyBootstrap(snapshot);

      try {
        this.applyBootstrap(await getBootstrap(force));
      } catch {
        if (!snapshot) {
          this.config = null;
          this.applyTheme();
          this.applySiteIdentity();
        }
        this.loaded = true;
      }
    },

    /** 换一个预设（= 用户自定义，立刻落本地） */
    setPreset(preset: ThemePreset): void {
      this.setLocalTheme(themeForPreset(preset));
    },

    /** 只改一个颜色（其余保持当前生效值） */
    setColor(field: keyof Omit<SiteConfigTheme, "preset">, value: string): void {
      this.setLocalTheme({ ...this.theme, [field]: value });
    },

    /**
     * 写入本地主题并立刻生效
     *
     * 传进来的东西一律过 normalizeTheme：颜色框里手打的值可能是 "abc"
     * （不合法的值宁可不生效，也不要把 CSS 变量写成垃圾）。
     */
    setLocalTheme(theme: SiteConfigTheme): void {
      const next = normalizeTheme(theme);
      if (!next) {
        console.warn("[theme] 忽略一个不合法的主题:", theme);
        return;
      }
      this.localTheme = next;
      writeLocalTheme(next);
      this.applyTheme();
    },

    /** 恢复跟随全站 */
    clearLocalTheme(): void {
      this.localTheme = null;
      writeLocalTheme(null);
      this.applyTheme();
    },

    /**
     * 应用站点身份：浏览器标签页标题 + 浏览器 / iOS 图标
     *
     * 站点名称来自 /api/config 的 siteName（标题统一以 siteName 结尾）；
     * siteIcon 存在时动态更新 favicon 和 apple-touch-icon，
     * 为空保留 index.html 中的默认图标。
     */
    applySiteIdentity(): void {
      const name = this.siteName;

      // 1. 标签页标题（无后缀，路由 afterEach 会拼接页面标题）
      document.title = name;

      // 2. favicon 与 iOS 添加到主屏幕图标
      const icon = this.siteIcon;
      let link = document.querySelector<HTMLLinkElement>("link[rel='icon']");
      if (icon) {
        if (!link) {
          link = document.createElement("link");
          link.rel = "icon";
          document.head.appendChild(link);
        }
        if (link.href !== icon) link.href = icon;

        const appleLink = document.querySelector<HTMLLinkElement>(
          "link[rel='apple-touch-icon']"
        );
        if (appleLink && appleLink.href !== icon) appleLink.href = icon;
      }
      // siteIcon 为空：保留 index.html 中的默认图标，不做任何修改

      // 3. iOS 添加到主屏幕的标题
      const meta = document.querySelector('meta[name="apple-mobile-web-app-title"]');
      if (meta) meta.setAttribute("content", name);
    },

    /** 将当前生效的主题应用到根元素 CSS 变量 */
    applyTheme(): void {
      const root = document.documentElement;
      const active = this.theme ?? DEFAULT_THEME;

      // 1. 预设主题（data-theme 触发 theme.css 中的变量组）
      root.setAttribute("data-theme", active.preset);
      // 本地自定义期间给个标记，方便排查"这套颜色哪来的"
      root.setAttribute("data-theme-source", this.hasLocalTheme ? "local" : "site");

      // 2. 具体颜色覆写（优先于预设）
      root.style.setProperty("--c-primary", active.primaryColor);
      root.style.setProperty("--c-bg", active.backgroundColor);
      root.style.setProperty("--c-text", active.textColor);
      root.style.setProperty("--c-accent", active.accentColor);

      // 3. 同步浏览器地址栏主题色
      const meta = document.querySelector('meta[name="theme-color"]');
      if (meta) meta.setAttribute("content", active.primaryColor);
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
