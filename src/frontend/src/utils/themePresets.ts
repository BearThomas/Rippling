/**
 * 主题预设表 —— 全站唯一一份数据
 *
 * 谁要用到它：主题 store（算"最终生效的是哪套"）、设置页（画预设色块）、
 * 管理面板（改全站默认）。以前这套颜色只写在 SettingsView 里，
 * store 拿不到 —— 于是"用户自己挑了深色"只能靠改 store.config.theme 来糊，
 * 结果管理员一改全站默认，所有人的自定义就一起被改掉了。
 *
 * 颜色值必须和 src/frontend/src/styles/theme.css 里
 * `[data-theme="..."]` 那几组变量一致：CSS 那份是"JS 没跑起来也有颜色"的兜底，
 * 这里是 JS 侧的同名副本。
 */

import type { SiteConfigTheme } from "../types";

export type ThemePreset = SiteConfigTheme["preset"];

/** 顺序即设置页里的显示顺序 */
export const PRESET_ORDER: ThemePreset[] = ["light", "dark", "campus", "warm"];

export const PRESET_LABELS: Record<ThemePreset, string> = {
  light: "明亮",
  dark: "深色",
  campus: "校园",
  warm: "暖色",
};

export const PRESET_COLORS: Record<ThemePreset, Omit<SiteConfigTheme, "preset">> = {
  light: {
    primaryColor: "#3b82f6",
    backgroundColor: "#f9fafb",
    textColor: "#1f2937",
    accentColor: "#10b981",
  },
  dark: {
    primaryColor: "#60a5fa",
    backgroundColor: "#111827",
    textColor: "#f9fafb",
    accentColor: "#34d399",
  },
  campus: {
    primaryColor: "#0d9488",
    backgroundColor: "#f0fdfa",
    textColor: "#134e4a",
    accentColor: "#f59e0b",
  },
  warm: {
    primaryColor: "#f97316",
    backgroundColor: "#fffbeb",
    textColor: "#431407",
    accentColor: "#ef4444",
  },
};

/** 站点配置缺失、用户也没自定义时的兜底（与 theme.css 的默认值一致） */
export const DEFAULT_THEME: SiteConfigTheme = { preset: "light", ...PRESET_COLORS.light };

/** 某个预设的完整主题（预设 + 那套颜色） */
export function themeForPreset(preset: ThemePreset): SiteConfigTheme {
  return { preset, ...PRESET_COLORS[preset] };
}

const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

function isHex(value: unknown): value is string {
  return typeof value === "string" && HEX.test(value.trim());
}

function isPreset(value: unknown): value is ThemePreset {
  return typeof value === "string" && (PRESET_ORDER as string[]).includes(value);
}

/**
 * 严格校验：本地存的那份自定义主题
 *
 * 认不出来就返回 null（= 当作没自定义过，回落到全站主题）。
 * 这里不"尽量救"：半个合法的主题比没有更麻烦（比如 preset 丢了却还有颜色，
 * 页面会停在上一套预设的 CSS 变量组里，看起来像随机出错）。
 */
export function normalizeTheme(input: unknown): SiteConfigTheme | null {
  if (!input || typeof input !== "object") return null;
  const raw = input as Record<string, unknown>;
  if (!isPreset(raw.preset)) return null;
  const { primaryColor, backgroundColor, textColor, accentColor } = raw;
  if (!isHex(primaryColor) || !isHex(backgroundColor) || !isHex(textColor) || !isHex(accentColor)) {
    return null;
  }
  return {
    preset: raw.preset,
    primaryColor: primaryColor.trim(),
    backgroundColor: backgroundColor.trim(),
    textColor: textColor.trim(),
    accentColor: accentColor.trim(),
  };
}

/**
 * 宽松纠正：服务端下发的全站主题
 *
 * 预设认不出来 → 明亮；某个颜色缺失/不合法 → 用该预设自带的颜色补上。
 * 这里不能返回 null：全站主题坏掉也得有东西可画。
 */
export function coerceSiteTheme(input: unknown): SiteConfigTheme {
  if (!input || typeof input !== "object") return DEFAULT_THEME;
  const raw = input as Record<string, unknown>;
  const preset = isPreset(raw.preset) ? raw.preset : "light";
  const base = PRESET_COLORS[preset];
  const pick = (key: "primaryColor" | "backgroundColor" | "textColor" | "accentColor") =>
    isHex(raw[key]) ? (raw[key] as string).trim() : base[key];
  return {
    preset,
    primaryColor: pick("primaryColor"),
    backgroundColor: pick("backgroundColor"),
    textColor: pick("textColor"),
    accentColor: pick("accentColor"),
  };
}
