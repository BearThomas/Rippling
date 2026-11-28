/**
 * 主题预设表 —— 全站唯一一份数据
 *
 * 颜色值与 src/frontend/src/styles/theme.css 中 `[data-theme="..."]`
 * 的四条 --c-* 底座变量保持完全一致：
 *   - light：DESIGN.md 浅色标准（#2563eb 主色 + #ffffff 主画布 + #18181b 正文 + #e11d48 心动色）
 *   - dark：DESIGN.md 深色标准（#60a5fa 主色 + #111214 主画布 + #f4f4f5 正文 + #fb7185 心动色）
 *   - campus / warm：保留既有预设色阶（兼容 test-theme.mjs 断言）
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
    primaryColor: "#2563eb",
    backgroundColor: "#ffffff",
    textColor: "#18181b",
    accentColor: "#e11d48",
  },
  dark: {
    primaryColor: "#60a5fa",
    backgroundColor: "#111214",
    textColor: "#f4f4f5",
    accentColor: "#fb7185",
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
