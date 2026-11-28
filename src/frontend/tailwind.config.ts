/**
 * Tailwind CSS 配置
 *
 * 主题颜色通过 CSS 变量映射（详见 styles/theme.css 与 styles/tokens.css），
 * 支持 light / dark / campus / warm 四套预设主题及用户本地/管理面板自定义色。
 *
 * 注意：颜色使用 `var(--*)` 直接映射，不支持 Tailwind 透明度修饰符（如 bg-primary/10）。
 * 半透明背景请直接使用语义 Token（bg-accent-soft / bg-danger-soft / bg-warning-soft 等）
 * 或 color-mix(in srgb, var(--accent) 12%, transparent)。
 */
import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{vue,ts}"],
  theme: {
    extend: {
      fontFamily: {
        sans: [
          "Inter",
          '"PingFang SC"',
          '"Hiragino Sans GB"',
          '"Microsoft YaHei"',
          "system-ui",
          "-apple-system",
          "BlinkMacSystemFont",
          '"Segoe UI"',
          "Roboto",
          "sans-serif",
        ],
        mono: [
          '"JetBrains Mono"',
          "ui-monospace",
          "SFMono-Regular",
          "Menlo",
          "Monaco",
          "Consolas",
          '"Liberation Mono"',
          "monospace",
        ],
      },
      colors: {
        // DESIGN.md 语义色 Token
        canvas: "var(--bg-canvas)",
        "canvas-soft": "var(--bg-canvas-soft)",
        surface: "var(--bg-surface)",
        hover: "var(--bg-hover)",
        subtle: "var(--border-subtle)",
        strong: "var(--border-strong)",
        ink: "var(--text-primary)",
        "ink-secondary": "var(--text-secondary)",
        "ink-muted": "var(--text-muted)",
        primary: "var(--accent)",
        "accent-soft": "var(--accent-soft)",
        "accent-warm": "var(--accent-warm)",
        "accent-warm-soft": "var(--accent-warm-soft)",
        danger: "var(--danger)",
        "danger-soft": "var(--danger-soft)",
        warning: "var(--warning)",
        "warning-soft": "var(--warning-soft)",
        success: "var(--success)",
        "success-soft": "var(--success-soft)",

        // 旧版兼容别名（供各页面渐进迁移，避免阶段 1 破坏现有视图）
        accent: "var(--c-accent)",
        page: "var(--c-bg)",
        "ink-soft": "var(--text-secondary)",
        line: "var(--border-subtle)",
      },
      maxWidth: {
        // 旧版移动端限宽（保留兼容）
        app: "480px",
        // Elk 三栏容器与中栏最佳阅读宽度
        layout: "1200px",
        feed: "660px",
      },
      boxShadow: {
        popover: "var(--shadow-popover)",
        fab: "var(--shadow-fab)",
      },
    },
  },
  plugins: [],
} satisfies Config;
